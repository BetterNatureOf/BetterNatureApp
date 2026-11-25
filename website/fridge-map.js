// Community-fridge map for the marketing site.
//
// Look: a dark, engraved-style Better Nature map (deep forest ground,
// hairline streets, relief shading, low dark 3D buildings) where the only
// colour is ours: numbered green fridge pins, a pink pin + route for the
// one you picked, cream blossom badges for chapters.
//
// Engine:
//   • Mapbox GL JS v3, Standard style in 3D, when `CONTENT.brand.mapboxToken`
//     holds a public, URL-restricted "pk." token (free tier: 50k web map
//     loads a month).
//   • Otherwise MapLibre GL (the open-source Mapbox GL engine) on
//     OpenFreeMap tiles: free, no account, no key, no limit. Also the
//     fallback if the Mapbox token is rejected.
//
// Search: a ZIP code, city or address via OpenStreetMap Nominatim (one
// request per search, never per keystroke). "Use my location" asks only
// when tapped. The route drawn is a straight line with the distance;
// "Get directions" hands off to Google or Apple Maps for the real route.

const ML = {
  js: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  jsSri: 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj',
  css: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
  cssSri: 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V',
  style: 'https://tiles.openfreemap.org/styles/positron',
};
const MB = {
  js: 'https://api.mapbox.com/mapbox-gl-js/v3.35.0/mapbox-gl.js',
  css: 'https://api.mapbox.com/mapbox-gl-js/v3.35.0/mapbox-gl.css',
  style: 'mapbox://styles/mapbox/standard',
};
const GEOCODE = 'https://nominatim.openstreetmap.org/search';
const GEO_CACHE = 'bn_chapter_geo_v1';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ISO2 = { USA: 'US', CHL: 'CL', ECU: 'EC', GTM: 'GT', IND: 'IN', URY: 'UY', MEX: 'MX', CAN: 'CA', GBR: 'GB', ARG: 'AR', BRA: 'BR', COL: 'CO', PER: 'PE' };
function countryName(code) {
  if (!code) return '';
  const c = String(code).toUpperCase(), iso2 = c.length === 2 ? c : ISO2[c];
  try { if (iso2 && Intl.DisplayNames) return iso2 === 'US' ? 'United States' : new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2); } catch (e) {}
  return code;
}

function loadOnce(tag, url, integrity) {
  const key = `__bnmap:${url}`;
  if (window[key]) return window[key];
  window[key] = new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    if (tag === 'link') { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; el.async = true; }
    if (integrity) { el.integrity = integrity; el.crossOrigin = 'anonymous'; }
    el.onload = resolve;
    el.onerror = () => reject(new Error('load failed: ' + url));
    document.head.appendChild(el);
  });
  return window[key];
}

function miles(a, b) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtMi = (d) => (d < 0.1 ? `${Math.round(d * 5280)} ft` : `${d < 10 ? d.toFixed(1) : Math.round(d)} mi`);

const CAPACITY = {
  high: { label: 'Plenty of room', tone: 'ok', fill: 0.25 },
  medium: { label: 'Some room', tone: 'mid', fill: 0.6 },
  low: { label: 'Nearly full', tone: 'low', fill: 0.92 },
};

const ICON = {
  fridge: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h12M9 6.5v1.5M9 13v2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  // five-petal cherry blossom, from the Better Nature tree
  blossom: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="currentColor">' +
    [0, 72, 144, 216, 288].map((r) => `<path transform="rotate(${r} 12 12)" d="M12 11.5C9.6 9.4 9.7 5.6 12 3.6c2.3 2 2.4 5.8 0 7.9Z"/>`).join('') +
    '</g><circle cx="12" cy="12" r="2.1" fill="#F2C14E"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 19 19 5M19 5h-7M19 5v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

// ── Dark Better Nature look for the OpenFreeMap (Positron) style ─────────
function darkenPositron(map) {
  const C = {
    ground: '#10241B', water: '#0A1913', green: '#14301F', line: 'rgba(226,218,200,0.22)',
    lineMajor: 'rgba(226,218,200,0.36)', text: '#BFB8A6', halo: '#10241B', border: 'rgba(247,244,240,0.16)',
  };
  for (const l of map.getStyle().layers) {
    const id = l.id;
    const set = (k, v) => { try { map.setPaintProperty(id, k, v); } catch (e) { /* not on this layer */ } };
    if (l.type === 'background') set('background-color', C.ground);
    else if (l.type === 'fill') {
      if (/water/.test(id)) set('fill-color', C.water);
      else if (/park|wood|grass|landcover|landuse/.test(id)) { set('fill-color', C.green); set('fill-opacity', 0.6); }
      else if (/building/.test(id)) { set('fill-color', '#163025'); set('fill-outline-color', 'rgba(226,218,200,0.28)'); }
      else set('fill-color', C.ground);
    } else if (l.type === 'line') {
      if (/water/.test(id)) set('line-color', '#173A2E');
      else if (/boundary|admin/.test(id)) set('line-color', C.border);
      else if (/motorway|trunk|primary/.test(id)) set('line-color', C.lineMajor);
      else set('line-color', C.line);
    } else if (l.type === 'symbol') {
      set('text-color', C.text); set('text-halo-color', C.halo); set('text-halo-width', 1.2);
      if (/poi/.test(id)) { try { map.setLayoutProperty(id, 'visibility', 'none'); } catch (e) {} }
    } else if (l.type === 'raster') {
      // natural-earth relief: a faint engraved texture at low zoom
      set('raster-saturation', -1); set('raster-opacity', 0.22); set('raster-brightness-max', 0.55);
    }
  }
  const labels = map.getStyle().layers.find((l) => l.type === 'symbol');
  if (!map.getLayer('bn-buildings-3d')) {
    map.addLayer({
      id: 'bn-buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#183428', 60, '#1F4334', 150, '#28533F'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
      },
    }, labels ? labels.id : undefined);
  }
}

// ── Chapter coordinates: stored lat/lng, else geocode the city once ──────
async function locateChapters(chapters, onEach) {
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(GEO_CACHE) || '{}'); } catch (e) {}
  for (const ch of chapters) {
    const lat = +ch.lat, lng = +ch.lng;
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) { onEach({ ...ch, lat, lng }); continue; }
    const q = [ch.city || ch.name, ch.state, ch.country].filter(Boolean).join(', ');
    if (!q) continue;
    if (cache[q]) { onEach({ ...ch, ...cache[q] }); continue; }
    try {
      const res = await fetch(`${GEOCODE}?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      const [hit] = await res.json();
      if (hit) {
        cache[q] = { lat: +hit.lat, lng: +hit.lon };
        try { localStorage.setItem(GEO_CACHE, JSON.stringify(cache)); } catch (e) {}
        onEach({ ...ch, ...cache[q] });
      }
    } catch (e) { /* skip this one */ }
    await sleep(1100); // Nominatim allows at most one request a second
  }
}

export async function renderFridgeMap(container) {
  container.innerHTML = '<div class="bnmap__loading">Loading the fridge map…</div>';
  const token = String((window.CONTENT && window.CONTENT.brand && window.CONTENT.brand.mapboxToken) || '').trim();
  let engine = /^pk\./.test(token) ? 'mapbox' : 'maplibre';

  let fridges = [], chapters = [];
  try {
    const [{ listFridges }, { listChapters }] = await Promise.all([
      import('./firebase-fridges.js'),
      import('./firebase-chapters.js?v=2026-06-05a'),
      engine === 'mapbox'
        ? Promise.all([loadOnce('link', MB.css), loadOnce('script', MB.js)]).catch(() => { engine = 'maplibre'; })
        : null,
    ]);
    if (engine === 'maplibre') await Promise.all([loadOnce('link', ML.css, ML.cssSri), loadOnce('script', ML.js, ML.jsSri)]);
    [fridges, chapters] = await Promise.all([listFridges(), listChapters().catch(() => [])]);
    fridges = fridges.map((f) => ({ ...f, lat: +f.lat, lng: +f.lng })).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng));
  } catch (e) {
    console.warn('fridge map failed to load', e);
    container.innerHTML = '<div class="bnmap__loading">The map couldn’t load right now. Please try again in a moment.</div>';
    return;
  }

  container.innerHTML = `
    <div class="fmap">
      <div class="fmap__map" id="fmapCanvas" role="region" aria-label="Map of community fridges and chapters"></div>
      <div class="fmap__shade" aria-hidden="true"></div>

      <div class="fmap__head">
        <div class="fmap__eyebrow">Community fridge network</div>
        <h3 class="fmap__title"><span id="fmapTitle">Fridges</span> <sup id="fmapCount">(${fridges.length})</sup></h3>
        <div class="fmap__layers" role="group" aria-label="Show on map">
          <button type="button" class="fmap__layer is-on" data-layer="fridge" aria-pressed="true"><i class="fmap__key fmap__key--fridge"></i>Fridges <span>${fridges.length}</span></button>
          <button type="button" class="fmap__layer is-on" data-layer="chapter" aria-pressed="true"><i class="fmap__key fmap__key--chapter"></i>Chapters <span>${chapters.length}</span></button>
        </div>
        <form class="fmap__search" id="fmapSearch" role="search">
          ${ICON.search}
          <input id="fmapQuery" type="search" placeholder="ZIP code, city or address" aria-label="Search by ZIP code, city or address" autocomplete="postal-code" />
          <button type="submit" class="fmap__go">Go</button>
        </form>
        <button type="button" class="fmap__near" id="fmapNearMe">Use my location</button>
        <p class="fmap__status" id="fmapStatus" aria-live="polite"></p>
      </div>

      <ol class="fmap__strip" id="fmapStrip" aria-label="Places on the map"></ol>
      <article class="fmap__card" id="fmapCard" hidden aria-live="polite"></article>
    </div>`;

  const $ = (s) => container.querySelector(s);
  const status = $('#fmapStatus');
  const strip = $('#fmapStrip');
  const card = $('#fmapCard');
  const root = container.querySelector('.fmap');
  const lib = engine === 'mapbox' ? window.mapboxgl : window.maplibregl;

  // Places on the map; fridges are numbered 01, 02, …
  const places = fridges.map((f, i) => ({ kind: 'fridge', n: i + 1, data: f, lat: f.lat, lng: f.lng }));
  const show = { fridge: true, chapter: true };
  let origin = null, selected = null, you = null;

  // ── the map (guarded: WebGL can be unavailable) ──
  let map = null;
  const start = fridges[0] || null;
  try {
    if (engine === 'mapbox') lib.accessToken = token;
    map = new lib.Map({
      container: $('#fmapCanvas'),
      style: engine === 'mapbox' ? MB.style : ML.style,
      ...(engine === 'mapbox' ? { config: { basemap: { lightPreset: 'night', theme: 'monochrome', show3dObjects: true, showPointOfInterestLabels: false, showTransitLabels: false } } } : {}),
      center: start ? [start.lng, start.lat] : [-40, 18],
      zoom: start ? 12 : 1.6,
      pitch: start ? 52 : 0,
      bearing: start ? -12 : 0,
      maxPitch: 70,
      cooperativeGestures: true,
      attributionControl: { compact: true },
    });
    map.addControl(new lib.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('error', (ev) => {
      const s = ev && ev.error && (ev.error.status || ev.error.statusCode);
      if (engine === 'mapbox' && (s === 401 || s === 403)) {
        console.warn('Mapbox token rejected; using the free MapLibre map instead');
        window.CONTENT.brand.mapboxToken = '';
        map.remove();
        renderFridgeMap(container);
      }
    });
    map.on('load', () => {
      if (engine === 'maplibre') darkenPositron(map);
      map.addSource('bn-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'bn-route-glow', type: 'line', source: 'bn-route', paint: { 'line-color': '#FF4D8D', 'line-width': 10, 'line-opacity': 0.25, 'line-blur': 6 } });
      map.addLayer({ id: 'bn-route', type: 'line', source: 'bn-route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#FF7AAB', 'line-width': 3.5, 'line-dasharray': [0.1, 2] } });
      drawRoute();
    });
  } catch (err) {
    console.warn('map unavailable', err);
    map = null;
    root.classList.add('fmap--nomap');
    $('#fmapCanvas').innerHTML = '<p class="fmap__nomap">This browser can’t draw the map, but you can still search and pick from the list below.</p>';
  }

  // ── markers ──
  function makeMarker(p) {
    const el = document.createElement('button');
    el.type = 'button';
    if (p.kind === 'fridge') {
      const cap = CAPACITY[p.data.capacity];
      el.className = `fpin fpin--${cap ? cap.tone : 'none'}`;
      el.innerHTML = `<span class="fpin__num">${pad(p.n)}</span><span class="fpin__drop" aria-hidden="true"><span class="fpin__core"></span></span>`;
      el.setAttribute('aria-label', `${pad(p.n)}: ${p.data.name || 'Community fridge'}${cap ? `, ${cap.label}` : ''}`);
    } else {
      el.className = 'cpin';
      el.innerHTML = `<span class="cpin__badge">${ICON.blossom}</span><span class="cpin__label">${esc(p.data.city || p.data.name || '')}</span>`;
      el.setAttribute('aria-label', `${p.data.city || p.data.name} chapter`);
    }
    el.addEventListener('click', (e) => { e.stopPropagation(); select(p, true); });
    p.el = el;
    p.marker = map ? new lib.Marker({ element: el, anchor: p.kind === 'fridge' ? 'bottom' : 'center' }).setLngLat([p.lng, p.lat]).addTo(map) : null;
  }
  places.forEach(makeMarker);

  // ── the bottom strip ──
  const visible = () => places.filter((p) => show[p.kind]);
  function renderStrip() {
    let rows = visible();
    if (origin) rows = rows.slice().sort((a, b) => miles(origin, a) - miles(origin, b));
    strip.innerHTML = rows.length ? rows.map((p) => {
      const d = origin ? miles(origin, p) : null;
      const title = p.kind === 'fridge' ? (p.data.name || 'Community fridge') : `${p.data.city || p.data.name} chapter`;
      const sub = p.kind === 'fridge'
        ? (p.data.address || [p.data.city, p.data.state].filter(Boolean).join(', '))
        : [p.data.state, countryName(p.data.country)].filter(Boolean).join(' · ');
      return `<li><button type="button" class="fmap__stop fmap__stop--${p.kind}${p === selected ? ' is-active' : ''}" data-key="${p.kind}-${p.n}">
        <span class="fmap__thumb">${p.kind === 'fridge' ? (p.data.photo_url ? `<img src="${esc(p.data.photo_url)}" alt="" loading="lazy" />` : ICON.fridge) : ICON.blossom}<i>${p.kind === 'fridge' ? pad(p.n) : '✿'}</i></span>
        <span class="fmap__stopText"><strong>${esc(title)}</strong><small>${esc(sub)}</small>${d != null ? `<em>${fmtMi(d)} away</em>` : ''}</span>
      </button></li>`;
    }).join('') : `<li class="fmap__empty">${fridges.length ? 'Nothing to show. Turn a layer back on.' : 'No fridges are listed yet; chapters add them as they open.'}</li>`;
    strip.querySelectorAll('.fmap__stop').forEach((b) => b.addEventListener('click', () => {
      const p = places.find((x) => `${x.kind}-${x.n}` === b.dataset.key);
      if (p) select(p, true);
    }));
  }

  // ── selection: pink pin, route, detail card ──
  function closeCard() {
    card.hidden = true; selected = null;
    places.forEach((x) => x.el && x.el.classList.remove('is-active'));
    drawRoute(); renderStrip();
  }
  function select(p, fly) {
    selected = p;
    places.forEach((x) => x.el && x.el.classList.toggle('is-active', x === p));
    const d = origin ? miles(origin, p) : null;
    const dest = encodeURIComponent(p.kind === 'fridge' && p.data.address ? p.data.address : `${p.lat},${p.lng}`);
    if (p.kind === 'fridge') {
      const f = p.data, cap = CAPACITY[f.capacity];
      card.innerHTML = `
        <button type="button" class="fmap__close" aria-label="Close">×</button>
        <div class="fmap__cardMedia">${f.photo_url ? `<img src="${esc(f.photo_url)}" alt="" />` : `<span class="fmap__cardIcon">${ICON.fridge}</span>`}<i>${pad(p.n)}</i></div>
        <div class="fmap__cardBody">
          <h4>${esc(f.name || 'Community fridge')}</h4>
          ${f.address ? `<p>${esc(f.address)}</p>` : ''}
          <ul class="fmap__facts">
            ${d != null ? `<li>${ICON.arrow}${fmtMi(d)}</li>` : ''}
            ${f.hours ? `<li>${ICON.clock}${esc(f.hours)}</li>` : ''}
            ${cap ? `<li><span class="fmap__meter fmap__meter--${cap.tone}"><i style="width:${cap.fill * 100}%"></i></span>${cap.label}</li>` : ''}
          </ul>
        </div>
        <div class="fmap__cardActions">
          <a class="fmap__cta" href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noreferrer">Get directions</a>
          <a class="fmap__alt" href="https://maps.apple.com/?daddr=${dest}" target="_blank" rel="noreferrer">Apple Maps ↗</a>
        </div>`;
    } else {
      const c = p.data;
      const members = typeof c.member_count === 'number' ? c.member_count : null;
      card.innerHTML = `
        <button type="button" class="fmap__close" aria-label="Close">×</button>
        <div class="fmap__cardMedia fmap__cardMedia--chapter"><span class="fmap__cardIcon">${ICON.blossom}</span></div>
        <div class="fmap__cardBody">
          <h4>${esc(c.city || c.name)} chapter</h4>
          <p>${esc([c.state, countryName(c.country)].filter(Boolean).join(' · '))}</p>
          <ul class="fmap__facts">
            ${c.president_name ? `<li>${ICON.pin}Led by ${esc(c.president_name)}</li>` : ''}
            ${members ? `<li>✿ ${members} member${members === 1 ? '' : 's'}</li>` : ''}
            ${d != null ? `<li>${ICON.arrow}${fmtMi(d)}</li>` : ''}
          </ul>
        </div>
        <div class="fmap__cardActions"><a class="fmap__cta" href="#chapters">See chapters</a></div>`;
    }
    card.hidden = false;
    card.querySelector('.fmap__close').addEventListener('click', closeCard);
    drawRoute();
    renderStrip();
    if (fly && map) {
      if (origin) {
        const b = new lib.LngLatBounds([origin.lng, origin.lat], [origin.lng, origin.lat]).extend([p.lng, p.lat]);
        map.fitBounds(b, { padding: { top: 160, bottom: 230, left: 80, right: 80 }, pitch: 50, maxZoom: 16, duration: 1100 });
      } else {
        map.flyTo({ center: [p.lng, p.lat], zoom: p.kind === 'fridge' ? 16 : 11.5, pitch: 58, bearing: -18, speed: 1.2, essential: true });
      }
    }
  }

  function drawRoute() {
    if (!map || !map.getSource || !map.getSource('bn-route')) return;
    const features = origin && selected
      ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [selected.lng, selected.lat]] } }]
      : [];
    map.getSource('bn-route').setData({ type: 'FeatureCollection', features });
  }

  function fitAll() {
    if (!map) return;
    const pts = visible();
    if (!pts.length) return;
    if (pts.length === 1) { map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 13, pitch: 52 }); return; }
    const b = new lib.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: { top: 140, bottom: 210, left: 60, right: 60 }, maxZoom: 13, duration: 900 });
  }

  function goTo(lat, lng, label) {
    origin = { lat, lng };
    if (map) {
      if (!you) {
        const el = document.createElement('div');
        el.className = 'fyou';
        el.setAttribute('aria-hidden', 'true');
        you = new lib.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      } else you.setLngLat([lng, lat]);
    }
    const nearest = places.filter((p) => p.kind === 'fridge').sort((a, b) => miles(origin, a) - miles(origin, b))[0];
    if (nearest) {
      status.textContent = `Nearest fridge: ${fmtMi(miles(origin, nearest))} from ${label}`;
      select(nearest, true);
    } else {
      status.textContent = `No fridges listed near ${label} yet.`;
      renderStrip();
      if (map) map.flyTo({ center: [lng, lat], zoom: 13, pitch: 55, essential: true });
    }
  }

  // ── controls ──
  container.querySelectorAll('.fmap__layer').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.layer;
    show[k] = !show[k];
    b.classList.toggle('is-on', show[k]);
    b.setAttribute('aria-pressed', String(show[k]));
    places.forEach((p) => { if (p.kind === k && p.el) p.el.hidden = !show[k]; });
    const titleIsFridges = show.fridge || !show.chapter;
    $('#fmapTitle').textContent = titleIsFridges ? 'Fridges' : 'Chapters';
    $('#fmapCount').textContent = `(${titleIsFridges ? fridges.length : places.filter((p) => p.kind === 'chapter').length})`;
    if (selected && !show[selected.kind]) closeCard();
    else renderStrip();
  }));

  $('#fmapSearch').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#fmapQuery').value.trim();
    if (!q) return;
    status.textContent = 'Searching…';
    try {
      const res = await fetch(`${GEOCODE}?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      const [hit] = await res.json();
      if (!hit) { status.textContent = `Couldn’t find “${q}”. Try a ZIP code or city.`; return; }
      goTo(+hit.lat, +hit.lon, q);
    } catch (err) {
      status.textContent = 'Search is unavailable right now.';
    }
  });
  $('#fmapNearMe').addEventListener('click', () => {
    if (!navigator.geolocation) { status.textContent = 'Location isn’t available in this browser.'; return; }
    status.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(
      (pos) => goTo(pos.coords.latitude, pos.coords.longitude, 'you'),
      () => { status.textContent = 'Location was blocked. Search a ZIP code instead.'; },
      { timeout: 10000, maximumAge: 300000 },
    );
  });

  renderStrip();
  if (map) map.once('load', fitAll);

  // Chapters appear as they're located (cached after the first visit).
  let cn = 0;
  locateChapters(chapters, (ch) => {
    const p = { kind: 'chapter', n: ++cn, data: ch, lat: ch.lat, lng: ch.lng };
    places.push(p);
    makeMarker(p);
    if (!show.chapter && p.el) p.el.hidden = true;
    renderStrip();
  }).then(() => { if (!selected && !origin) fitAll(); });
}
