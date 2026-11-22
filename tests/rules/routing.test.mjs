// Routing providers (functions/dispatchRouting.js) with a fake fetch:
// Mapbox Matrix batching and response handling, Directions geometry, and
// honest failures (missing token, auth, rate limit, timeout, no route,
// null elements, partial responses, network errors). Never logs tokens.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const R = require('./dispatchRouting.js');

const DEST = [35.15, -90.05];
const pts = (n) => Array.from({ length: n }, (_, i) => [35.1 + i * 0.001, -90.0]);
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => { calls.push(String(url)); return handler(new URL(String(url)), opts, calls.length); };
  fn.calls = calls;
  return fn;
}

describe('Mapbox Matrix', () => {
  it('builds the documented request and maps durations to seconds per origin', async () => {
    const f = fakeFetch((u) => {
      assert.match(u.pathname, /^\/directions-matrix\/v1\/mapbox\/driving\//);
      assert.equal(u.searchParams.get('annotations'), 'duration');
      assert.equal(u.searchParams.get('destinations'), '2');
      assert.equal(u.searchParams.get('sources'), '0;1');
      return json({ code: 'Ok', durations: [[120], [300]] });
    });
    const p = R.mapboxProvider({ token: 'pk.test', fetchImpl: f });
    assert.deepEqual(await p.matrix({ origins: pts(2), destination: DEST, profile: 'driving' }), { status: 'ok', error: undefined, seconds: [120, 300] });
  });

  it('batches origins under the 25-coordinate limit', async () => {
    const f = fakeFetch((u) => {
      const n = u.pathname.split('/').pop().split(';').length;
      assert.ok(n <= 25);
      return json({ code: 'Ok', durations: Array.from({ length: n - 1 }, () => [60]) });
    });
    const out = await R.mapboxProvider({ token: 't', fetchImpl: f }).matrix({ origins: pts(60), destination: DEST, profile: 'cycling' });
    assert.equal(f.calls.length, 3); assert.equal(out.status, 'ok'); assert.equal(out.seconds.length, 60);
    assert.ok(f.calls.every((c) => c.includes('/mapbox/cycling/')));
  });

  it('keeps null elements as null and reports a partial answer', async () => {
    const f = fakeFetch(() => json({ code: 'Ok', durations: [[null], [90]] }));
    const out = await R.mapboxProvider({ token: 't', fetchImpl: f }).matrix({ origins: pts(2), destination: DEST, profile: 'driving' });
    assert.deepEqual(out.seconds, [null, 90]); assert.equal(out.status, 'partial');
  });

  it('a failed batch leaves its origins null while other batches still answer', async () => {
    const f = fakeFetch((u, _o, n) => (n === 1 ? json({}, 500) : n === 2 ? json({}, 500) : json({ code: 'Ok', durations: Array.from({ length: 6 }, () => [30]) })));
    const out = await R.mapboxProvider({ token: 't', fetchImpl: f }).matrix({ origins: pts(30), destination: DEST, profile: 'driving' });
    assert.equal(out.status, 'partial'); assert.equal(out.error, 'provider_error');
    assert.equal(out.seconds.slice(0, 24).every((v) => v === null), true);
    assert.equal(out.seconds.slice(24).every((v) => v === 30), true);
  });

  for (const [label, response, error] of [
    ['missing token', null, 'missing_token'],
    ['invalid token (401)', json({ message: 'Not Authorized - Invalid Token' }, 401), 'auth'],
    ['forbidden (403)', json({}, 403), 'auth'],
    ['rate limited (429, retried once)', json({}, 429), 'rate_limited'],
    ['unknown profile (404)', json({ code: 'ProfileNotFound' }, 404), 'bad_profile'],
    ['invalid input (422)', json({ code: 'InvalidInput' }, 422), 'invalid_input'],
    ['no route', json({ code: 'NoRoute' }), 'no_route'],
    ['malformed body', json({ code: 'Ok', durations: [[1]] }), 'bad_response'],
  ]) {
    it(`${label} → unavailable, every value null`, async () => {
      const f = fakeFetch(() => response);
      const out = await R.mapboxProvider({ token: response ? 't' : '', fetchImpl: f }).matrix({ origins: pts(2), destination: DEST, profile: 'driving' });
      assert.equal(out.status, 'unavailable'); assert.equal(out.error, error);
      assert.deepEqual(out.seconds, [null, null]);
      if (error === 'rate_limited') assert.equal(f.calls.length, 2);
    });
  }

  it('timeouts and network failures are reported, not thrown', async () => {
    const timeout = fakeFetch(() => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; });
    assert.equal((await R.mapboxProvider({ token: 't', fetchImpl: timeout }).matrix({ origins: pts(1), destination: DEST, profile: 'driving' })).error, 'timeout');
    const down = fakeFetch(() => { throw new TypeError('fetch failed'); });
    assert.equal((await R.mapboxProvider({ token: 't', fetchImpl: down }).matrix({ origins: pts(1), destination: DEST, profile: 'driving' })).error, 'network');
  });

  it('rejects unsupported profiles instead of calling driving estimates walking', async () => {
    const f = fakeFetch(() => json({ code: 'Ok', durations: [[1]] }));
    const out = await R.mapboxProvider({ token: 't', fetchImpl: f }).matrix({ origins: pts(1), destination: DEST, profile: 'driving-traffic' });
    assert.equal(out.error, 'bad_profile'); assert.equal(f.calls.length, 0);
  });
});

describe('Mapbox Directions', () => {
  it('returns road geometry for an accepted trip', async () => {
    const f = fakeFetch((u) => {
      assert.match(u.pathname, /^\/directions\/v5\/mapbox\/walking\//);
      assert.equal(u.searchParams.get('geometries'), 'geojson'); assert.equal(u.searchParams.get('overview'), 'full');
      return json({ code: 'Ok', routes: [{ duration: 900, distance: 1200, geometry: { type: 'LineString', coordinates: [[-90, 35.1], [-90.01, 35.11], [-90.02, 35.12]] } }] });
    });
    const r = await R.mapboxProvider({ token: 't', fetchImpl: f }).route({ coordinates: [[35.1, -90], [35.12, -90.02]], profile: 'walking' });
    assert.equal(r.status, 'ok'); assert.equal(r.seconds, 900); assert.equal(r.geometry.length, 3);
  });
  it('no route or a missing token never produces a straight line', async () => {
    const f = fakeFetch(() => json({ code: 'NoRoute', routes: [] }));
    assert.deepEqual(await R.mapboxProvider({ token: 't', fetchImpl: f }).route({ coordinates: [[35.1, -90], [35.12, -90.02]], profile: 'driving' }), { status: 'unavailable', error: 'no_route' });
    assert.equal((await R.mapboxProvider({ token: '' }).route({ coordinates: [[35.1, -90], [35.12, -90.02]], profile: 'driving' })).error, 'missing_token');
  });
});

describe('provider selection', () => {
  it('prefers Mapbox, keeps OSRM working, and is honestly off otherwise', async () => {
    assert.equal(R.routingProvider({ MAPBOX_SERVER_TOKEN: 'x' }).name, 'mapbox');
    assert.equal(R.routingProvider({ RESCUE_ROUTING_BASE_URL: 'https://osrm.example' }).name, 'osrm');
    const none = R.routingProvider({});
    assert.equal(none.name, 'none');
    assert.equal((await none.matrix({ origins: pts(2), destination: DEST, profile: 'driving' })).status, 'unavailable');
  });
  it('OSRM refuses non-driving profiles rather than mislabel them', async () => {
    const f = fakeFetch(() => json({ code: 'Ok', durations: [[1]] }));
    const out = await R.osrmProvider({ baseUrl: 'https://osrm.example', fetchImpl: f }).matrix({ origins: pts(1), destination: DEST, profile: 'cycling' });
    assert.equal(out.error, 'bad_profile'); assert.equal(f.calls.length, 0);
  });
});
