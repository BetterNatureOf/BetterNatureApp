// Rescue dispatch (functions/rescueDispatch.js) against the Firestore
// emulator: bounded rounds, expansion, release recovery, escalation,
// retries and races. Admin SDK, demo project only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { latLngToCell, gridRingUnsafe } = require('h3-js');
const D = require('./rescueDispatch.js');

const PROJECT_ID = 'demo-bn-dispatch';
const MIN = 60_000;
const LAT = 35.1495, LNG = -90.049;
const ORIGIN = latLngToCell(LAT, LNG, 7);
const cellAt = (ring, i = 0) => (ring === 0 ? ORIGIN : gridRingUnsafe(ORIGIN, ring)[i]);
const noRoads = async () => new Map();

let app, db, T0;
before(() => { app = initializeApp({ projectId: PROJECT_ID }, 'dispatch-test'); db = getFirestore(app); });
after(async () => { await deleteApp(app); });

const volunteer = (extra = {}) => ({
  role: 'member', chapter_id: 'ch', member_status: 'approved', verification_status: 'approved',
  contract_volunteer_signed: true, driver_setup_complete: true, push_enabled: true, onesignal_player_id: 'p', ...extra,
});

async function share(uid, cell, ageMin = 5) {
  await db.doc(`rescue_availability/${uid}`).set({ cell, updated_at: Timestamp.fromMillis(T0 - ageMin * MIN) });
}

function offer(extra = {}) {
  return {
    status: 'available', chapter_id: 'ch', restaurant_id: 'r1', receiver_uid: 'site', claimed_by: null,
    restaurant_lat: LAT, restaurant_lng: LNG, estimated_weight_lbs: 20,
    destination_confirmation: {
      site_name: 'Pantry', address: 'A', contact: 'C', confirmed_by: 'pres', accepted_weight_lbs: 20,
      confirmed_at: Timestamp.fromMillis(T0 - MIN),
      pickup_by: Timestamp.fromMillis(T0 + 120 * MIN), arrival_by: Timestamp.fromMillis(T0 + 180 * MIN),
    },
    ...extra,
  };
}

const ref = () => db.doc('pickups/p');
const state = async () => (await db.doc('pickups/p/dispatch/state').get()).data();
const alertsFor = async () => (await db.collection('notifications').where('kind', '==', 'pickup_alert').get())
  .docs.map((d) => d.data().user_id).sort();
const noticesOfType = async (type) => (await db.collection('notifications').get()).docs
  .filter((d) => d.data().data?.type === type).map((d) => d.data().user_id).sort();
async function open(extra = {}, at = T0) {
  await ref().set(offer(extra));
  return D.onPickupChange(db, ref(), (await ref().get()).data(), { now: at, roadTimes: noRoads });
}

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  T0 = Date.now();
  const users = {
    near1: volunteer(), near2: volunteer(), mid: volunteer(), far: volunteer(),
    optout: volunteer({ notif_pickup: false }), unverified: volunteer({ verification_status: 'pending' }),
    other: volunteer({ chapter_id: 'ch2' }), stale: volunteer(), busy: volunteer(), site: volunteer(),
    pres: volunteer({ role: 'chapter_president' }), coord: volunteer({ roles: ['chapter_vol_coord'] }),
    exec: volunteer({ role: 'executive', chapter_id: 'hq' }),
  };
  await Promise.all(Object.entries(users).map(([uid, u]) => db.doc(`users/${uid}`).set(u)));
  await Promise.all([
    share('near1', cellAt(0)), share('near2', cellAt(1)), share('optout', cellAt(0)), share('unverified', cellAt(0)),
    share('other', cellAt(0)), share('stale', cellAt(0), 90), share('busy', cellAt(1)), share('site', cellAt(0)),
    share('mid', cellAt(3)), share('far', cellAt(6)),
  ]);
  await db.doc('pickups/other-run').set({ status: 'claimed', claimed_by: 'busy', chapter_id: 'ch' });
});

describe('rescue dispatch: rounds', () => {
  it('round 1 alerts only fresh, eligible, opted-in, free volunteers in the chapter nearby', async () => {
    const out = await open();
    assert.equal(out.action, 'round');
    assert.deepEqual(await alertsFor(), ['near1', 'near2']);
    const s = await state();
    assert.equal(s.round, 1); assert.equal(s.status, 'searching'); assert.equal(s.alerted_count, 2);
    assert.equal(s.last_round.ranking, 'distance');
    assert.ok(s.last_round.skipped.ineligible >= 2);   // opt-out, unverified, other chapter
    assert.equal(s.last_round.skipped.busy, 1);
    // the receiving site is never offered its own delivery
    assert.ok(!(await alertsFor()).includes('site'));
  });

  it('a retried trigger does not restart the generation or re-alert', async () => {
    await open();
    const again = await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0, roadTimes: noRoads });
    assert.equal(again.action, 'none');
    assert.deepEqual(await alertsFor(), ['near1', 'near2']);
    assert.equal((await state()).round, 1);
  });

  it('two runners racing on the same round produce one round', async () => {
    await open();
    const later = T0 + 11 * MIN;
    const [a, b] = await Promise.all([
      D.advance(db, ref(), { now: later, roadTimes: noRoads }),
      D.advance(db, ref(), { now: later, roadTimes: noRoads }),
    ]);
    assert.deepEqual([a.action, b.action].sort(), ['round', 'skipped']);
    assert.equal((await state()).round, 2);
    assert.deepEqual(await alertsFor(), ['mid', 'near1', 'near2']);
  });

  it('expands each round, never re-alerting, then escalates once to chapter coordinators', async () => {
    await open();
    await D.advance(db, ref(), { now: T0 + 11 * MIN, roadTimes: noRoads });   // round 2 → mid
    await D.advance(db, ref(), { now: T0 + 22 * MIN, roadTimes: noRoads });   // round 3 → far
    assert.deepEqual(await alertsFor(), ['far', 'mid', 'near1', 'near2']);
    const out = await D.advance(db, ref(), { now: T0 + 33 * MIN, roadTimes: noRoads });
    assert.equal(out.action, 'escalated'); assert.equal(out.reason, 'no_acceptance');
    assert.deepEqual(await noticesOfType('rescue_escalation'), ['coord', 'pres']);
    await D.advance(db, ref(), { now: T0 + 44 * MIN, roadTimes: noRoads });
    assert.deepEqual(await noticesOfType('rescue_escalation'), ['coord', 'pres']);
    assert.equal((await state()).status, 'escalated');
    const due = await D.advanceDue(db, { now: T0 + 60 * MIN, roadTimes: noRoads });
    assert.equal(due.length, 0);
  });

  it('escalates immediately when the deadline is already close', async () => {
    const out = await open({ destination_confirmation: { ...offer().destination_confirmation,
      pickup_by: Timestamp.fromMillis(T0 + 25 * MIN) } });
    assert.equal(out.action, 'escalated'); assert.equal(out.reason, 'deadline_approaching');
    assert.deepEqual(await alertsFor(), []);
  });

  it('falls back to executives when the chapter has no coordinator', async () => {
    await db.doc('users/pres').delete(); await db.doc('users/coord').delete();
    await open({ destination_confirmation: { ...offer().destination_confirmation,
      pickup_by: Timestamp.fromMillis(T0 + 20 * MIN) } });
    assert.deepEqual(await noticesOfType('rescue_escalation'), ['exec']);
  });

  it('missing location records the gap and escalates instead of guessing', async () => {
    await open({ restaurant_lat: null, restaurant_lng: null });
    const s = await state();
    assert.equal(s.last_round.location, 'missing'); assert.equal(s.last_round.recipients, 0);
    assert.deepEqual(await alertsFor(), []);
  });

  it('uses road time only when every candidate has an estimate', async () => {
    // near1 is closer in a straight line but slower by road.
    const roads = async (cells) => new Map(cells.map((c) => [c, c === cellAt(0) ? 900 : 300]));
    await ref().set(offer());
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0, roadTimes: roads });
    assert.equal((await state()).last_round.ranking, 'road_time');
    const partial = async () => new Map([[cellAt(0), 900]]);
    await db.recursiveDelete(db.doc('pickups/p'));
    await db.doc(`pickups/p`).set(offer({ destination_confirmation: { ...offer().destination_confirmation,
      confirmed_at: Timestamp.fromMillis(T0) } }));
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0, roadTimes: partial });
    assert.equal((await state()).last_round.ranking, 'distance');
  });
});

describe('rescue dispatch: recovery and reminders', () => {
  it('a release starts a new generation that skips the volunteer who released', async () => {
    await open();
    await ref().update({ status: 'claimed', claimed_by: 'near1' });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + 5 * MIN, roadTimes: noRoads });
    assert.equal((await state()).status, 'assigned');
    await ref().update({ status: 'available', claimed_by: null, released_by: 'near1',
      released_at: Timestamp.fromMillis(T0 + 10 * MIN) });
    const out = await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + 10 * MIN, roadTimes: noRoads });
    assert.equal(out.action, 'round');
    const s = await state();
    assert.match(s.generation, /^release_/); assert.deepEqual(s.excluded_uids, ['near1']);
    assert.deepEqual(out.recipients, ['near2']);
  });

  it('reminds a claimant who has not left and escalates once', async () => {
    await open();
    await ref().update({ status: 'claimed', claimed_by: 'near2' });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + 5 * MIN, roadTimes: noRoads });
    assert.equal((await D.advance(db, ref(), { now: T0 + 30 * MIN })).action, 'none');
    const near = T0 + 105 * MIN;   // 15 minutes before the pickup cutoff
    assert.equal((await D.advance(db, ref(), { now: near })).action, 'reminded');
    assert.equal((await D.advance(db, ref(), { now: near + MIN })).action, 'none');
    assert.deepEqual(await noticesOfType('rescue_start_reminder'), ['near2']);
    assert.deepEqual(await noticesOfType('rescue_escalation'), ['coord', 'pres']);
  });

  it('a no-show release tells the volunteer once, and the donor when it closes the offer', async () => {
    await db.doc('restaurants/r1').set({ user_id: 'donorUid' });
    await open();
    await ref().update({ status: 'cancelled', claimed_by: null, cancel_reason: 'Pickup window expired',
      abandoned_at: Timestamp.fromMillis(T0 + MIN), abandoned_prior_claimant: 'near2' });
    const after = (await ref().get()).data();
    await D.onPickupChange(db, ref(), after, { now: T0 + MIN, roadTimes: noRoads });
    await D.onPickupChange(db, ref(), after, { now: T0 + MIN, roadTimes: noRoads });
    assert.deepEqual(await noticesOfType('pickup_auto_released'), ['near2']);
    assert.deepEqual(await noticesOfType('pickup_closed'), ['donorUid']);
  });

  it('a cancelled or started rescue closes its dispatch', async () => {
    await open();
    await ref().update({ status: 'cancelled' });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, roadTimes: noRoads });
    assert.equal((await state()).status, 'closed');
    assert.equal((await D.advanceDue(db, { now: T0 + 60 * MIN, roadTimes: noRoads })).length, 0);
  });

  it('the scheduler only picks up rescues that are due', async () => {
    await open();
    assert.equal((await D.advanceDue(db, { now: T0 + MIN, roadTimes: noRoads })).length, 0);
    const due = await D.advanceDue(db, { now: T0 + 11 * MIN, roadTimes: noRoads });
    assert.deepEqual(due.map((r) => [r.pickupId, r.action]), [['p', 'round']]);
  });
});
