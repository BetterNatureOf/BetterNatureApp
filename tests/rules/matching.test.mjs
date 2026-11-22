// Practical matching: shared cargo rules, dispatch filtering, and the
// coordinator suggestions callable (emulator, admin SDK, demo project).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { latLngToCell, gridRingUnsafe } = require('h3-js');
const cargo = require('./lib/rescueCargo.js');
const D = require('./rescueDispatch.js');
const { suggest } = require('./rescueSuggestions.js');

describe('cargo rules', () => {
  const pickup = (extra) => ({ estimated_weight_lbs: 30, packages: 4, food_category: 'prepared_cold', ...extra });
  const user = (vehicle) => ({ vehicle });
  it('fits when vehicle, capacity and equipment all cover the load', () => {
    const fit = cargo.cargoFit(pickup(), user({ type: 'car', package_capacity: 6, weight_capacity_lbs: 150, equipment: ['cooler'] }));
    assert.equal(fit.status, 'fits');
  });
  it('reports each specific mismatch', () => {
    const fit = cargo.cargoFit(pickup({ estimated_weight_lbs: 200, packages: 20 }),
      user({ type: 'car', package_capacity: 6, weight_capacity_lbs: 150, equipment: [] }));
    assert.equal(fit.status, 'does_not_fit');
    assert.deepEqual(fit.problems.sort(), ['equipment:cooler', 'equipment:hand_truck', 'packages', 'weight']);
  });
  it('bikes only take light loads', () => {
    const bike = user({ type: 'bike', package_capacity: 2, weight_capacity_lbs: 25, equipment: ['cooler'] });
    assert.equal(cargo.cargoFit(pickup({ estimated_weight_lbs: 20, packages: 2 }), bike).status, 'fits');
    assert.ok(cargo.cargoFit(pickup({ estimated_weight_lbs: 40, packages: 2 }), bike).problems.includes('vehicle'));
  });
  it('missing details are unknown, never a fit', () => {
    const noVehicle = cargo.cargoFit(pickup(), {});
    assert.equal(noVehicle.status, 'unknown'); assert.ok(noVehicle.unknown.includes('vehicle'));
    const noLoad = cargo.cargoFit({ estimated_weight_lbs: 30 },
      user({ type: 'van', package_capacity: 30, weight_capacity_lbs: 800, equipment: ['cooler'] }));
    assert.equal(noLoad.status, 'unknown');
    assert.deepEqual(noLoad.unknown.sort(), ['food_category', 'rescue_packages']);
  });
  it('a known mismatch outranks unknowns', () => {
    const fit = cargo.cargoFit(pickup(), user({ type: 'car', weight_capacity_lbs: 10 }));
    assert.equal(fit.status, 'does_not_fit');
  });
});

const PROJECT_ID = 'demo-bn-matching';
const MIN = 60_000;
const LAT = 35.1495, LNG = -90.049;
const ORIGIN = latLngToCell(LAT, LNG, 7);
const noRoads = async () => new Map();
let app, db, T0;
before(() => { app = initializeApp({ projectId: PROJECT_ID }, 'matching-test'); db = getFirestore(app); });
after(async () => { await deleteApp(app); });

const volunteer = (extra = {}) => ({
  role: 'member', name: 'V', chapter_id: 'ch', member_status: 'approved', verification_status: 'approved',
  contract_volunteer_signed: true, driver_setup_complete: true, ...extra,
});
const offer = (extra = {}) => ({
  status: 'available', chapter_id: 'ch', restaurant_id: 'r1', claimed_by: null, restaurant_lat: LAT, restaurant_lng: LNG,
  estimated_weight_lbs: 30, packages: 4, food_category: 'prepared_cold',
  destination_confirmation: { site_name: 'S', address: 'A', contact: 'C', confirmed_by: 'pres', accepted_weight_lbs: 30,
    confirmed_at: Timestamp.fromMillis(T0 - MIN), pickup_by: Timestamp.fromMillis(T0 + 120 * MIN),
    arrival_by: Timestamp.fromMillis(T0 + 180 * MIN) },
  ...extra,
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  T0 = Date.now();
  const users = {
    fits: volunteer({ name: 'Fits', vehicle: { type: 'suv', package_capacity: 12, weight_capacity_lbs: 300, equipment: ['cooler'] } }),
    nocooler: volunteer({ name: 'No cooler', vehicle: { type: 'suv', package_capacity: 12, weight_capacity_lbs: 300, equipment: [] } }),
    unknown: volunteer({ name: 'Unknown' }),
    other: volunteer({ chapter_id: 'ch2' }),
    busy: volunteer(),
    pres: volunteer({ role: 'chapter_president' }),
    otherpres: volunteer({ role: 'chapter_president', chapter_id: 'ch2' }),
  };
  await Promise.all(Object.entries(users).map(([uid, u]) => db.doc(`users/${uid}`).set(u)));
  const cells = { fits: gridRingUnsafe(ORIGIN, 1)[0], nocooler: ORIGIN, unknown: gridRingUnsafe(ORIGIN, 1)[1],
    other: ORIGIN, busy: ORIGIN };
  await Promise.all(Object.entries(cells).map(([uid, cell]) =>
    db.doc(`rescue_availability/${uid}`).set({ cell, updated_at: Timestamp.fromMillis(T0 - 5 * MIN) })));
  await db.doc('pickups/other-run').set({ status: 'enroute', claimed_by: 'busy', chapter_id: 'ch' });
  await db.doc('pickups/p').set(offer());
});

describe('dispatch uses cargo fit', () => {
  it('skips known mismatches, keeps unknowns eligible, and records both', async () => {
    const out = await D.onPickupChange(db, db.doc('pickups/p'), (await db.doc('pickups/p').get()).data(), { now: T0, roadTimes: noRoads });
    assert.equal(out.recipients.length, 1);
    assert.ok(['fits', 'unknown'].includes(out.recipients[0]));
    const s = (await db.doc('pickups/p/dispatch/state').get()).data();
    assert.equal(s.last_round.skipped.does_not_fit, 1);
    assert.equal(s.last_round.cargo_unknown, 1);
  });
});

describe('coordinator suggestions', () => {
  it('only chapter coordinators and execs can ask', async () => {
    await assert.rejects(suggest(db, { pickupId: 'p' }, 'fits', { now: T0, roadTimes: noRoads }), /coordinators/);
    await assert.rejects(suggest(db, { pickupId: 'p' }, 'otherpres', { now: T0, roadTimes: noRoads }), /coordinators/);
    await assert.rejects(suggest(db, { pickupId: 'p' }, null, { now: T0 }), /Sign in/);
  });

  it('lists free, eligible chapter volunteers with fit first and explicit gaps', async () => {
    const out = await suggest(db, { pickupId: 'p' }, 'pres', { now: T0, roadTimes: noRoads });
    assert.deepEqual(out.candidates.map((c) => [c.uid, c.fit]), [['fits', 'fits'], ['unknown', 'unknown'], ['nocooler', 'does_not_fit']]);
    assert.ok(out.candidates.every((c) => c.timing === 'unknown' && c.road_minutes === null));
    assert.ok(out.gaps.includes('road_times') && out.gaps.includes('receiving_site_details'));
    assert.equal(out.candidates[0].full_trip.status, 'missing_route_data');
  });

  it('uses road time for timing when the routing service answers', async () => {
    const roads = async (cells) => new Map(cells.map((c) => [c, c === ORIGIN ? 600 : 7200]));
    const out = await suggest(db, { pickupId: 'p' }, 'pres', { now: T0, roadTimes: roads });
    const byId = Object.fromEntries(out.candidates.map((c) => [c.uid, c]));
    assert.equal(byId.nocooler.timing, 'can_make_pickup');
    assert.equal(byId.fits.timing, 'too_far_for_pickup_cutoff');
    assert.ok(!out.gaps.includes('road_times'));
  });

  it('runs the full rescueMatching trip check once every input is known', async () => {
    await db.doc('pickups/p').update({ receiving_site: { id: 'site1', to_site_minutes: 15, food_categories: ['prepared_cold'],
      remaining_packages: 20, opens_at: Timestamp.fromMillis(T0 - 60 * MIN), closes_at: Timestamp.fromMillis(T0 + 240 * MIN) } });
    const roads = async (cells) => new Map(cells.map((c) => [c, 600]));
    const out = await suggest(db, { pickupId: 'p' }, 'pres', { now: T0, roadTimes: roads });
    const fits = out.candidates.find((c) => c.uid === 'fits');
    assert.equal(fits.full_trip.status, 'feasible');
    assert.ok(fits.full_trip.margin_minutes > 0);
    assert.equal(out.candidates.find((c) => c.uid === 'nocooler').full_trip.status, 'cargo_requirements');
  });
});
