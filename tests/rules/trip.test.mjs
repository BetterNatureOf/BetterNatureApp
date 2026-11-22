// Trip planning (functions/rescueMatching.journey) and the shared policy:
// loading, unloading, waiting, the single margin, mixed legs, the latest
// feasible start, and honest unknowns. Pure functions, fake clock.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { journey, siteOpensBefore } = require('./rescueMatching.js');
const { POLICY, travelProfile, approximateMinutes } = require('./lib/rescuePolicy.js');

const MIN = 60_000;
const NOW = Date.parse('2026-11-23T18:00:00Z');
const road = (m) => ({ minutes: m, basis: 'road' });
const approx = (m) => ({ minutes: m, basis: 'approximate' });
const at = (m) => NOW + m * MIN;

describe('policy', () => {
  it('holds the operating defaults in one place', () => {
    assert.equal(POLICY.OFFER_CONCURRENCY, 1);
    assert.equal(POLICY.OFFER_MAX_RESPONSE_MIN, 5);
    assert.equal(POLICY.LOADING_MIN, 10); assert.equal(POLICY.UNLOADING_MIN, 10);
    assert.equal(POLICY.MARGIN_ROAD_MIN, 5); assert.equal(POLICY.MARGIN_APPROXIMATE_MIN, 15);
    assert.equal(POLICY.PARTNER_MAX_RESPONSE_MIN, 30);
    assert.equal(POLICY.RECURRING_CONFIRM_LEAD_MIN, 180);
    assert.equal(POLICY.RESERVATION_GRACE_MIN, 30);
    assert.equal(POLICY.ROUTING_PROVIDER, 'mapbox');
  });
  it('plans bikes and walkers at their own pace, and unknown vehicles as driving (flagged)', () => {
    assert.deepEqual(travelProfile({ vehicle: { type: 'bike' } }), { profile: 'cycling', assumed: false });
    assert.deepEqual(travelProfile({ vehicle: { type: 'walk' } }), { profile: 'walking', assumed: false });
    assert.deepEqual(travelProfile({}), { profile: 'driving', assumed: true });
    assert.ok(approximateMinutes(3, 'walking') > approximateMinutes(3, 'cycling'));
    assert.ok(approximateMinutes(3, 'cycling') > approximateMinutes(3, 'driving'));
    assert.equal(approximateMinutes(NaN), null);
  });
});

describe('journey', () => {
  it('adds loading, unloading and the road margin exactly once', () => {
    // 10 travel + 10 load = loaded +20; +10 travel +10 unload = finish +40.
    const t = journey({ now: NOW, toPickup: road(10), toSite: road(10), pickupBy: at(25), arrivalBy: at(45) });
    assert.equal(t.feasible, true); assert.equal(t.marginMinutes, 5);
    assert.equal(t.loadedAt, at(20)); assert.equal(t.finishAt, at(40));
    assert.equal(t.latestStartAt, NOW);                // both deadlines are exactly met with 5 min slack
    assert.equal(journey({ now: NOW, toPickup: road(10), toSite: road(10), pickupBy: at(24), arrivalBy: at(45) }).reason, 'pickup_deadline');
    assert.equal(journey({ now: NOW, toPickup: road(10), toSite: road(10), pickupBy: at(25), arrivalBy: at(44) }).reason, 'delivery_deadline');
  });

  it('any approximate leg switches to the 15-minute margin', () => {
    const base = { now: NOW, pickupBy: at(60), arrivalBy: at(50) };
    assert.equal(journey({ ...base, toPickup: road(10), toSite: road(10) }).feasible, true);
    const mixed = journey({ ...base, toPickup: road(10), toSite: approx(10) });
    assert.equal(mixed.marginMinutes, 15); assert.equal(mixed.basis, 'approximate');
    assert.equal(mixed.feasible, false); assert.equal(mixed.reason, 'delivery_deadline');
  });

  it('waits for the food to be ready and for the site to open', () => {
    const t = journey({ now: NOW, toPickup: road(5), toSite: road(5), readyAt: at(30), siteOpensAt: at(60),
      pickupBy: at(90), arrivalBy: at(120) });
    assert.equal(t.loadedAt, at(40));                  // arrives +5, waits to +30, loads to +40
    assert.equal(t.finishAt, at(70));                  // arrives +45, waits to +60, unloads to +70
    assert.equal(t.waitMinutes, 25 + 15);
    // Waiting absorbs a later start: latest start is bounded by the deadlines, not the wait.
    assert.equal(t.latestStartAt, Math.min(at(90 - 5 - 10 - 5), at(120 - 5 - 10 - 5 - 10 - 5)));
  });

  it('a volunteer free only until earlier than the handoff is not feasible', () => {
    const t = journey({ now: NOW, toPickup: road(10), toSite: road(10), pickupBy: at(60), arrivalBy: at(120), availableUntil: at(30) });
    assert.equal(t.feasible, false); assert.equal(t.reason, 'volunteer_unavailable');
  });

  it('missing legs or deadlines are unknown, never zero and never feasible', () => {
    assert.deepEqual(journey({ now: NOW, toPickup: null, toSite: road(5), pickupBy: at(60), arrivalBy: at(90) }), { feasible: null, reason: 'pickup_leg_unknown' });
    assert.deepEqual(journey({ now: NOW, toPickup: road(5), toSite: null, pickupBy: at(60), arrivalBy: at(90) }), { feasible: null, reason: 'dropoff_leg_unknown' });
    assert.deepEqual(journey({ now: NOW, toPickup: road(5), toSite: { minutes: NaN, basis: 'road' }, pickupBy: at(60), arrivalBy: at(90) }), { feasible: null, reason: 'dropoff_leg_unknown' });
    assert.deepEqual(journey({ now: NOW, toPickup: road(5), toSite: road(5), pickupBy: NaN, arrivalBy: at(90) }), { feasible: null, reason: 'deadline_unknown' });
  });
});

describe('site hours', () => {
  it('finds the opening time of the slot containing the arrival, in the site’s timezone', () => {
    const site = { timezone: 'America/Chicago', hours: { mon: [{ open: '09:00', close: '17:00' }] } };
    const arrival = Date.parse('2026-11-23T20:00:00Z');           // Mon 2:00 PM Chicago
    assert.equal(siteOpensBefore(site, arrival), Date.parse('2026-11-23T15:00:00Z'));
    assert.equal(siteOpensBefore(site, Date.parse('2026-11-24T00:00:00Z')), null);   // 6 PM: closed
    assert.equal(siteOpensBefore({}, arrival), null);
  });
});
