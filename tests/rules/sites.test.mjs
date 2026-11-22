// Receiving sites: hours, pause, food types, capacity reservations,
// partial acceptance, remainder disposition and completion accounting.
// Admin SDK against the emulator, demo project only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

const PROJECT_ID = 'demo-bn-sites';
let db, S, complete, T0;
const MIN = 60_000;

before(() => {
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
  S = require('./receivingSites.js');
  complete = require('./completePickup.js')._complete;
});
after(async () => { await Promise.all(admin.apps.map((a) => a.delete())); });

const allWeek = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [{ open: '00:00', close: '23:59' }]]));
const site = (extra = {}) => ({ name: 'Mid-South Pantry', type: 'staffed_center', chapter_id: 'ch', address: '239 S Dudley',
  timezone: 'America/Chicago', hours: allWeek, status: 'active', food_categories: ['prepared_cold', 'produce'],
  capacity: { packages_per_day: 10, weight_lbs_per_day: 200 }, receiver_uid: 'desk',
  contacts: [{ name: 'Pat', phone: '901-555-0140' }], ...extra });
const pickup = (extra = {}) => ({ status: 'pending_destination', chapter_id: 'ch', restaurant_id: 'r1', claimed_by: null,
  estimated_weight_lbs: 30, packages: 4, food_category: 'prepared_cold',
  pickup_window_until: new Date(T0 + 90 * MIN).toISOString(), ...extra });
const approved = { role: 'member', chapter_id: 'ch', member_status: 'approved', verification_status: 'approved',
  contract_volunteer_signed: true, driver_setup_complete: true, name: 'Val' };

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  T0 = Date.now();
  await Promise.all([
    db.doc('users/pres').set({ ...approved, role: 'chapter_president' }),
    db.doc('users/otherpres').set({ ...approved, role: 'chapter_president', chapter_id: 'ch2' }),
    db.doc('users/val').set(approved),
    db.doc('users/desk').set({ role: 'member', chapter_id: 'ch', member_status: 'approved' }),
    db.doc('restaurants/r1').set({ user_id: 'donor', name: 'Green Table', status: 'approved' }),
    db.doc('receiving_sites/s1').set(site()),
    db.doc('pickups/p1').set(pickup()),
    db.doc('pickups/p2').set(pickup({ packages: 7 })),
  ]);
});

const arrival = () => T0 + 150 * MIN;

describe('site checks', () => {
  it('blocks paused sites, closed hours and food the site does not take', () => {
    const p = pickup();
    assert.deepEqual(S.siteFit(site({ status: 'paused' }), p, { arrivalBy: arrival(), now: T0 }).reasons, ['site_paused']);
    const closed = Object.fromEntries(Object.keys(allWeek).map((d) => [d, []]));
    assert.ok(S.siteFit(site({ hours: closed }), p, { arrivalBy: arrival(), now: T0 }).reasons.includes('closed_at_arrival'));
    assert.ok(S.siteFit(site({ food_categories: ['bakery'] }), p, { arrivalBy: arrival(), now: T0 }).reasons.includes('food_type_not_accepted'));
  });
  it('blocks a date-specific closure and food the site can’t store', () => {
    const p = pickup();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(arrival()));
    assert.ok(S.siteFit(site({ closures: [{ date: day }] }), p, { arrivalBy: arrival(), now: T0 }).reasons.includes('closed_on_date'));
    assert.ok(S.siteFit(site({ storage: ['ambient'] }), p, { arrivalBy: arrival(), now: T0 }).reasons.includes('no_cold_storage'));
    assert.equal(S.siteFit(site({ storage: ['ambient', 'refrigerated'] }), p, { arrivalBy: arrival(), now: T0 }).ok, true);
  });

  it('a stale hold past its expiry no longer consumes capacity', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(arrival()));
    await db.doc('receiving_sites/s1/reservations/old').set({ day, packages: 9, status: 'held', expires_at: Timestamp.fromMillis(T0 - MIN) });
    assert.equal((await S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 })).ok, true);
  });

  it('an expired pause no longer blocks', () => {
    const fit = S.siteFit(site({ status: 'paused', paused_until: Timestamp.fromMillis(T0 - MIN) }), pickup(), { arrivalBy: arrival(), now: T0 });
    assert.equal(fit.ok, true);
  });
  it('unknowns are warnings, not passes or failures', () => {
    const fit = S.siteFit(site({ hours: undefined, food_categories: [] }), pickup({ food_category: null, packages: null }),
      { arrivalBy: arrival(), now: T0 });
    assert.equal(fit.ok, true);
    assert.deepEqual(fit.warnings.sort(), ['accepted_food_unknown', 'hours_unknown', 'packages_unknown']);
  });
});

describe('confirming against a saved site', () => {
  it('only the chapter coordinator can confirm', async () => {
    await assert.rejects(S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'val', { now: T0 }), /coordinators/);
    await assert.rejects(S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'otherpres', { now: T0 }), /coordinators/);
  });

  it('opens the offer, links the site, assigns its receiver and reserves capacity', async () => {
    const out = await S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 });
    assert.equal(out.ok, true);
    const p = (await db.doc('pickups/p1').get()).data();
    assert.equal(p.status, 'available');
    assert.equal(p.destination_confirmation.site_id, 's1');
    assert.equal(p.receiver_uid, 'desk');
    const r = (await db.doc('receiving_sites/s1/reservations/p1').get()).data();
    assert.equal(r.status, 'held'); assert.equal(r.packages, 4);
    // replay is a no-op
    assert.equal((await S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 })).cached, true);
  });

  it('refuses a second rescue that would exceed the daily capacity', async () => {
    await S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 });
    await assert.rejects(S.confirmDestination(db, { pickupId: 'p2', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 }),
      (e) => e.details?.reasons?.includes('over_package_capacity'));
    assert.equal((await db.doc('pickups/p2').get()).data().status, 'pending_destination');
  });

  it('released and received reservations free capacity correctly', async () => {
    await S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 });
    const before = (await db.doc('pickups/p1').get()).data();
    await db.doc('pickups/p1').update({ status: 'cancelled' });
    await S.reconcileReservation(db, db.doc('pickups/p1'), before, (await db.doc('pickups/p1').get()).data());
    assert.equal((await db.doc('receiving_sites/s1/reservations/p1').get()).data().status, 'released');
    // capacity is free again for the larger rescue
    assert.equal((await S.confirmDestination(db, { pickupId: 'p2', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 })).ok, true);
  });

  it('a reroute to a one-time site releases the old reservation; a receipt records what was accepted', async () => {
    await S.confirmDestination(db, { pickupId: 'p1', siteId: 's1', arrivalBy: arrival() }, 'pres', { now: T0 });
    const opened = (await db.doc('pickups/p1').get()).data();
    const received = { ...opened, receiving_receipt: { weight_lbs: 20, rejected_weight_lbs: 10 } };
    await S.reconcileReservation(db, db.doc('pickups/p1'), opened, received);
    const r = (await db.doc('receiving_sites/s1/reservations/p1').get()).data();
    assert.equal(r.status, 'received'); assert.equal(r.accepted_weight_lbs, 20); assert.equal(r.rejected_weight_lbs, 10);
    const rerouted = { ...received, destination_confirmation: { site_name: 'Elsewhere' } };
    await S.reconcileReservation(db, db.doc('pickups/p1'), received, rerouted);
    assert.equal((await db.doc('receiving_sites/s1/reservations/p1').get()).data().status, 'received');
  });
});

describe('partial acceptance and completion', () => {
  async function delivered(receipt) {
    await db.doc('pickups/p1').set(pickup({
      status: 'enroute', claimed_by: 'val', claimed_at: Timestamp.fromMillis(T0 - 60 * MIN), enroute_at: Timestamp.fromMillis(T0 - 40 * MIN),
      verified_by_restaurant_at: Timestamp.fromMillis(T0 - 30 * MIN), receiver_uid: 'desk',
      destination_confirmation: { site_name: 'Mid-South Pantry', address: 'A', contact: 'Pat', site_id: 's1',
        accepted_weight_lbs: 30, pickup_by: Timestamp.fromMillis(T0 + 60 * MIN), arrival_by: Timestamp.fromMillis(T0 + 120 * MIN) },
      receiving_receipt: { receiver_name: 'Pat', recorded_by: 'desk', source: 'receiving_site', ...receipt },
    }));
  }

  it('completion waits for the remainder disposition', async () => {
    await delivered({ weight_lbs: 20, rejected_weight_lbs: 10, rejection_reason: 'No cold storage left' });
    await assert.rejects(complete({ pickup_id: 'p1', actual_weight_lbs: 20 }, { auth: { uid: 'val' } }),
      (e) => e.details?.reason === 'remainder_pending');
  });

  it('only coordinators record the disposition, and a second site counts toward impact', async () => {
    await delivered({ weight_lbs: 20, rejected_weight_lbs: 10, rejection_reason: 'No cold storage left' });
    await assert.rejects(S.recordRemainder(db, { pickupId: 'p1', outcome: 'composted' }, 'val'), /coordinators/);
    await assert.rejects(S.recordRemainder(db, { pickupId: 'p1', outcome: 'delivered_elsewhere', siteName: 'Fridge', acceptedLbs: 15 }, 'pres'),
      /up to the rejected amount/);
    await S.recordRemainder(db, { pickupId: 'p1', outcome: 'delivered_elsewhere', siteName: 'Cooper St fridge', acceptedLbs: 8 }, 'pres');
    await assert.rejects(complete({ pickup_id: 'p1', actual_weight_lbs: 20 }, { auth: { uid: 'val' } }),
      (e) => e.details?.reason === 'weight_mismatch');
    const out = await complete({ pickup_id: 'p1', actual_weight_lbs: 28 }, { auth: { uid: 'val' } });
    assert.equal(out.actual_weight_lbs, 28);
    assert.equal((await db.doc('member_activity/pickup_p1').get()).data().lbs, 28);
  });

  it('food that was discarded is recorded but never counted', async () => {
    await delivered({ weight_lbs: 20, rejected_weight_lbs: 10, rejection_reason: 'Packaging damaged' });
    await S.recordRemainder(db, { pickupId: 'p1', outcome: 'discarded', note: 'Torn bags' }, 'pres');
    const p = (await db.doc('pickups/p1').get()).data();
    assert.equal(p.remainder_disposition.outcome, 'discarded'); assert.equal(p.remainder_disposition.weight_lbs, 10);
    assert.ok((await db.doc('audit_events/remainder_p1').get()).exists);
    const out = await complete({ pickup_id: 'p1', actual_weight_lbs: 20 }, { auth: { uid: 'val' } });
    assert.equal(out.actual_weight_lbs, 20);
  });

  it('a full receipt completes with no disposition step', async () => {
    await delivered({ weight_lbs: 30 });
    assert.equal((await complete({ pickup_id: 'p1', actual_weight_lbs: 30 }, { auth: { uid: 'val' } })).actual_weight_lbs, 30);
  });
});
