// Road-routing providers behind one interface.
//
//   provider.matrix({ origins, destination, profile })
//     origins: [[lat, lng], ...], destination: [lat, lng],
//     profile: 'driving' | 'cycling' | 'walking'
//     → { status: 'ok' | 'partial' | 'unavailable', error?, seconds: (number|null)[] }
//       seconds[i] is origin i → destination, null when there is no route or
//       no answer. A missing value is never zero.
//
//   provider.route({ coordinates, profile })
//     → { status: 'ok' | 'unavailable', error?, seconds, meters,
//         geometry: [[lng, lat], ...] }   (road geometry, never a straight line)
//
// Providers:
//   mapbox   Mapbox Matrix API (candidate comparison) and Directions API
//            (accepted-trip geometry). Server token: MAPBOX_SERVER_TOKEN.
//   osrm     any OSRM-compatible service at RESCUE_ROUTING_BASE_URL (kept
//            for existing integrations).
//   none     no routing configured: everything is 'unavailable', and
//            callers fall back to labeled straight-line estimates.
// Tests inject their own provider with the same shape.
//
// Origins are approximate area centers (H3 cells), never volunteer
// identifiers. Tokens are sent only in the request and never logged.
// Ordinary driving profiles are not traffic-aware; nothing here claims
// real-time traffic.

const TIMEOUT_MS = 2500;
const RETRIES = 1;                       // one retry on timeout / 5xx / 429
const MAPBOX_MAX_COORDS = 25;            // Matrix: driving, walking, cycling
const MAPBOX_DIRECTIONS_MAX_COORDS = 25;
const OSRM_MAX_ORIGINS = 24;
const PROFILES = ['driving', 'cycling', 'walking'];
const CACHE_TTL_MS = 5 * 60_000;         // short in-memory reuse within one instance
const CACHE_MAX = 500;

const unavailable = (error, n = 0) => ({ status: 'unavailable', error, seconds: new Array(n).fill(null) });
const lngLat = ([lat, lng]) => `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`;
const validPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

// Error category for a failed HTTP response. Bodies may echo the URL, so
// only the status and the provider's `code` are kept.
function httpError(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'bad_profile';
  if (status === 422) return 'invalid_input';
  if (status >= 500) return 'provider_error';
  return 'bad_response';
}

async function fetchJson(url, { headers = {}, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  let last = 'network';
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error', headers: { Accept: 'application/json', ...headers } });
      if (res.ok) {
        try { return { ok: true, body: await res.json() }; } catch { return { ok: false, error: 'bad_response' }; }
      }
      last = httpError(res.status);
      if (!['rate_limited', 'provider_error'].includes(last)) return { ok: false, error: last };
    } catch (e) {
      last = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network';
    }
  }
  return { ok: false, error: last };
}

function memo() {
  const store = new Map();
  return {
    get(key, now = Date.now()) { const hit = store.get(key); return hit && hit.until > now ? hit.value : undefined; },
    set(key, value, now = Date.now()) {
      if (store.size >= CACHE_MAX) store.delete(store.keys().next().value);
      store.set(key, { value, until: now + CACHE_TTL_MS });
    },
  };
}

// ── Mapbox ─────────────────────────────────────────────────────────────
function mapboxProvider({ token, fetchImpl = fetch, baseUrl = 'https://api.mapbox.com' } = {}) {
  const cache = memo();
  async function matrix({ origins, destination, profile }) {
    if (!token) return unavailable('missing_token', origins?.length || 0);
    if (!PROFILES.includes(profile)) return unavailable('bad_profile', origins.length);
    if (!validPoint(destination)) return unavailable('invalid_input', origins.length);
    const seconds = new Array(origins.length).fill(null);
    const errors = new Set();
    const batch = MAPBOX_MAX_COORDS - 1;           // one slot for the destination
    for (let start = 0; start < origins.length; start += batch) {
      const slice = origins.slice(start, start + batch);
      const usable = slice.map((p, i) => [p, start + i]).filter(([p]) => validPoint(p));
      if (!usable.length) continue;
      const key = `${profile}|${lngLat(destination)}|${usable.map(([p]) => lngLat(p)).join(';')}`;
      let row = cache.get(key);
      if (!row) {
        const coords = [...usable.map(([p]) => lngLat(p)), lngLat(destination)].join(';');
        const url = new URL(`${baseUrl}/directions-matrix/v1/mapbox/${profile}/${coords}`);
        url.searchParams.set('sources', usable.map((_, i) => i).join(';'));
        url.searchParams.set('destinations', String(usable.length));
        url.searchParams.set('annotations', 'duration');
        url.searchParams.set('access_token', token);
        const res = await fetchJson(url, { fetchImpl });
        if (!res.ok) { errors.add(res.error); continue; }
        const { code, durations } = res.body || {};
        if (code === 'NoRoute') { errors.add('no_route'); continue; }
        if (code !== 'Ok' || !Array.isArray(durations) || durations.length !== usable.length) { errors.add('bad_response'); continue; }
        row = durations.map((r) => (Array.isArray(r) && Number.isFinite(r[0]) && r[0] >= 0 ? r[0] : null));
        cache.set(key, row);
      }
      row.forEach((v, i) => { seconds[usable[i][1]] = v; });
    }
    const got = seconds.filter((v) => v !== null).length;
    if (!got) return { status: 'unavailable', error: [...errors][0] || 'no_route', seconds };
    return { status: got === origins.length ? 'ok' : 'partial', error: errors.size ? [...errors][0] : undefined, seconds };
  }
  async function route({ coordinates, profile }) {
    if (!token) return { status: 'unavailable', error: 'missing_token' };
    if (!PROFILES.includes(profile)) return { status: 'unavailable', error: 'bad_profile' };
    if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > MAPBOX_DIRECTIONS_MAX_COORDS ||
        !coordinates.every(validPoint)) return { status: 'unavailable', error: 'invalid_input' };
    const key = `route|${profile}|${coordinates.map(lngLat).join(';')}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const url = new URL(`${baseUrl}/directions/v5/mapbox/${profile}/${coordinates.map(lngLat).join(';')}`);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('access_token', token);
    const res = await fetchJson(url, { fetchImpl });
    if (!res.ok) return { status: 'unavailable', error: res.error };
    const { code, routes } = res.body || {};
    if (code === 'NoRoute' || code === 'NoSegment') return { status: 'unavailable', error: 'no_route' };
    const r = Array.isArray(routes) ? routes[0] : null;
    const geometry = r?.geometry?.type === 'LineString' && Array.isArray(r.geometry.coordinates) ? r.geometry.coordinates : null;
    if (code !== 'Ok' || !geometry || geometry.length < 2 || !Number.isFinite(r.duration)) return { status: 'unavailable', error: 'bad_response' };
    const out = { status: 'ok', seconds: r.duration, meters: Number.isFinite(r.distance) ? r.distance : null, geometry };
    cache.set(key, out);
    return out;
  }
  return { name: 'mapbox', matrix, route };
}

// ── OSRM-compatible (existing integrations) ─────────────────────────────
function osrmProvider({ baseUrl, token, fetchImpl = fetch } = {}) {
  let base;
  try { base = new URL(baseUrl); } catch { base = null; }
  const usableBase = base && base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  async function matrix({ origins, destination, profile }) {
    if (!usableBase) return unavailable('missing_token', origins?.length || 0);
    if (profile !== 'driving') return unavailable('bad_profile', origins.length);   // OSRM setups here are driving-only
    if (!origins.length || origins.length > OSRM_MAX_ORIGINS || !validPoint(destination) || !origins.every(validPoint)) {
      return unavailable('invalid_input', origins.length);
    }
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/table/v1/driving/${[...origins, destination].map(lngLat).join(';')}`;
    url.searchParams.set('sources', origins.map((_, i) => i).join(';'));
    url.searchParams.set('destinations', String(origins.length));
    url.searchParams.set('annotations', 'duration');
    const res = await fetchJson(url, { headers, fetchImpl });
    if (!res.ok) return unavailable(res.error, origins.length);
    const { code, durations } = res.body || {};
    if (code !== 'Ok' || !Array.isArray(durations) || durations.length !== origins.length) return unavailable('bad_response', origins.length);
    const seconds = durations.map((r) => (Array.isArray(r) && Number.isFinite(r[0]) && r[0] >= 0 ? r[0] : null));
    const got = seconds.filter((v) => v !== null).length;
    return { status: !got ? 'unavailable' : got === origins.length ? 'ok' : 'partial', error: got ? undefined : 'no_route', seconds };
  }
  async function route() { return { status: 'unavailable', error: 'not_supported' }; }
  return { name: 'osrm', matrix, route };
}

function noneProvider() {
  return {
    name: 'none',
    async matrix({ origins }) { return unavailable('not_configured', origins?.length || 0); },
    async route() { return { status: 'unavailable', error: 'not_configured' }; },
  };
}

// The configured provider. Mapbox is the intended provider; OSRM stays
// usable for existing setups; otherwise routing is off.
let cached = null;
function routingProvider(env = process.env) {
  if (env === process.env && cached) return cached;
  const p = env.MAPBOX_SERVER_TOKEN ? mapboxProvider({ token: env.MAPBOX_SERVER_TOKEN })
    : env.RESCUE_ROUTING_BASE_URL ? osrmProvider({ baseUrl: env.RESCUE_ROUTING_BASE_URL, token: env.RESCUE_ROUTING_TOKEN })
      : noneProvider();
  if (env === process.env) cached = p;
  return p;
}

module.exports = { routingProvider, mapboxProvider, osrmProvider, noneProvider, PROFILES, MAPBOX_MAX_COORDS };
