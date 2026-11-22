// Rescue dispatch offers (functions/rescueDispatch.js + rescueOffers.js)
// against the Firestore emulator with a fake clock: journey-based ranking,
// one-candidate offers with expiry, accept/decline, widening, escalation,
// races, retries, cancellation, opt-outs, stale location, routing failure.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { latLngToCell, gridRingUnsafe } = require('h3-js');
const D = require('./rescueDispatch.js');
const { respond } = require('./rescueOffers.js');

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
  role: 'member', chapter_id: 'ch', member_status: 'approved', verification_status: 'approved', name: 'V',
  contract_volunteer_signed: true, driver_setup_complete: true, push_enabled: true, onesignal_player_id: 'p', ...extra,
});
async function share(uid, cell, ageMin = 5) {
  await db.doc(`rescue_availability/${uid}`).set({ cell, updated_at: Timestamp.fromMillis(T0 - ageMin * MIN) });
}
function offer(extra = {}, pickupMin = 120, arrivalMin = 180) {
  return {
    status: 'available', chapter_id: 'ch', restaurant_id: 'r1', receiver_uid: 'site', claimed_by: null,
    restaurant_lat: LAT, restaurant_lng: LNG, fridge_lat: LAT + 0.02, fridge_lng: LNG, estimated_weight_lbs: 20,
    destination_confirmation: {
      site_name: 'Pantry', address: 'A', contact: 'C', confirmed_by: 'pres', accepted_weight_lbs: 20,
      confirmed_at: Timestamp.fromMillis(T0 - MIN),
      pickup_by: Timestamp.fromMillis(T0 + pickupMin * MIN), arrival_by: Timestamp.fromMillis(T0 + arrivalMin * MIN),
    },
    ...extra,
  };
}
const ref = () => db.doc('pickups/p');
const state = async () => (await db.doc('pickups/p/dispatch/state').get()).data();
const offers = async () => (await db.collection('pickups/p/offers').get()).docs.map((d) => d.data());
const openOfferUids = async () => (await offers()).filter((o) => o.status === 'open').map((o) => o.uid).sort();
const offeredUids = async () => (await offers()).map((o) => o.uid).sort();
const noticesOfType = async (type) => (await db.collection('notifications').get()).docs
  .filter((d) => d.data().data?.type === type).map((d) => d.data().user_id).sort();
async function open(extra = {}, at = T0, roads = noRoads, pickupMin, arrivalMin) {
  await ref().set(offer(extra, pickupMin, arrivalMin));
  return D.onPickupChange(db, ref(), (await ref().get()).data(), { now: at, roadTimes: roads });
}
const tick = (minutes, roads = noRoads) => D.advance(db, ref(), { now: T0 + minutes * MIN, roadTimes: roads });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  T0 = Date.now();
  await Promise.all(Object.entries({
    near: volunteer(), mid: volunteer(), far: volunteer(), pres: volunteer({ role: 'chapter_president' }),
    coord: volunteer({ roles: ['chapter_vol_coord'] }), exec: volunteer({ role: 'executive', chapter_id: 'hq' }),
  }).map(([uid, u]) => db.doc(`users/${uid}`).set(u)));
});

describe('choosing who to offer', () => {
  it('offers exactly one feasible volunteer, closest finish first', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    const out = await open();
    assert.deepEqual(out.recipients, ['near']);
    const [o] = await offers();
    assert.equal(o.status, 'open'); assert.equal(o.trip.basis, 'approximate');
    assert.ok(o.trip.to_pickup_minutes >= 0 && o.trip.total_minutes > o.trip.to_pickup_minutes);
    assert.ok(o.expires_at.toMillis() - T0 <= 5 * MIN);
    assert.deepEqual(await noticesOfType('rescue_offer'), ['near']);
  });

  it('skips the closest volunteer whose vehicle can’t carry the load and offers a farther one who can', async () => {
    await db.doc('users/near').update({ vehicle: { type: 'bike', package_capacity: 1, weight_capacity_lbs: 10, equipment: [] } });
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    const out = await open();
    assert.deepEqual(out.recipients, ['mid']);
    assert.equal((await state()).last_round.skipped.does_not_fit, 1);
  });

  it('ranks by road time when the routing service answers, not straight-line distance', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    const roads = async (cells) => new Map(cells.map((c) => [c, c === cellAt(0) ? 3000 : 600]));
    const out = await open({}, T0, roads);
    assert.deepEqual(out.recipients, ['mid']);
    assert.equal((await offers())[0].trip.to_pickup_basis, 'road');
  });

  it('routing failure falls back to a labeled estimate, never a crash or a fake road ETA', async () => {
    await share('near', cellAt(0));
    const failing = async () => { throw new Error('timeout'); };
    const out = await open({}, T0, failing);
    assert.deepEqual(out.recipients, ['near']);
    assert.equal((await state()).last_round.routing, 'approximate');
    assert.equal((await offers())[0].trip.basis, 'approximate');
  });

  it('nobody can make a too-short window: no offer, coordinator decides', async () => {
    await share('far', cellAt(6));
    const out = await open({}, T0, noRoads, 45, 90);
    assert.equal(out.action, 'escalated'); assert.equal(out.reason, 'no_feasible_volunteer');
    assert.deepEqual(await offeredUids(), []);
    assert.deepEqual(await noticesOfType('rescue_escalation'), ['coord', 'pres']);
  });

  it('opted-out, stale and unapproved volunteers are never offered', async () => {
    await db.doc('users/near').update({ notif_pickup: false });
    await db.doc('users/mid').update({ verification_status: 'pending' });
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(0)), share('far', cellAt(1), 90)]);
    const out = await open();
    assert.equal(out.action, 'escalated');
    const s = await state();
    assert.equal(s.last_round.skipped.stale, 1);
    assert.ok(s.last_round.skipped.ineligible >= 2);
  });

  it('a volunteer on another rescue is skipped', async () => {
    await db.doc('pickups/other').set({ status: 'enroute', claimed_by: 'near', chapter_id: 'ch' });
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    assert.deepEqual((await open()).recipients, ['mid']);
  });
});

describe('offer lifecycle', () => {
  it('waits for the response window, then expires the offer and offers the next person', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    assert.equal((await tick(2)).action, 'waiting');
    const next = await tick(6);
    assert.deepEqual(next.recipients, ['mid']);
    const all = await offers();
    assert.equal(all.find((o) => o.uid === 'near').status, 'expired');
    const note = (await db.collection('notifications').where('user_id', '==', 'near').get()).docs[0].data();
    assert.equal(note.data.offer_status, 'expired');
  });

  it('declining moves to the next candidate immediately, without penalty', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    const out = await respond(db, { pickupId: 'p', response: 'decline' }, 'near', { now: T0 + MIN,
      advance: (d, r) => D.advance(d, r, { now: T0 + MIN, roadTimes: noRoads }) });
    assert.equal(out.declined, true);
    assert.deepEqual(await openOfferUids(), ['mid']);
    const user = (await db.doc('users/near').get()).data();
    assert.equal(user.leaderboard_score, undefined);
  });

  it('widens the search only after the closer ring is exhausted, then escalates', async () => {
    await Promise.all([share('near', cellAt(0)), share('far', cellAt(3))]);
    assert.deepEqual((await open()).recipients, ['near']);
    const widened = await tick(6);
    assert.deepEqual(widened.recipients, ['far']);
    assert.equal((await state()).ring_index, 1);
    const end = await tick(12);
    assert.equal(end.action, 'escalated'); assert.equal(end.reason, 'no_acceptance');
  });

  it('accepting assigns atomically and withdraws the other offers', async () => {
    process.env.RESCUE_OFFER_BATCH = '1';
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    // mid browses and accepts directly while near holds the offer: one wins.
    const results = await Promise.allSettled([
      respond(db, { pickupId: 'p', response: 'accept' }, 'near', { now: T0 + MIN }),
      respond(db, { pickupId: 'p', response: 'accept' }, 'mid', { now: T0 + MIN }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const winner = (await ref().get()).data().claimed_by;
    assert.ok(['near', 'mid'].includes(winner));
    const loser = results.find((r) => r.status === 'rejected');
    assert.match(loser.reason.details?.reason || '', /taken|closed|offer_closed/);
    assert.deepEqual(await openOfferUids(), []);
  });

  it('a retried accept after a dropped connection returns the same result', async () => {
    await share('near', cellAt(0));
    await open();
    await respond(db, { pickupId: 'p', response: 'accept' }, 'near', { now: T0 + MIN });
    const again = await respond(db, { pickupId: 'p', response: 'accept' }, 'near', { now: T0 + MIN });
    assert.equal(again.cached, true);
  });

  it('an expired offer cannot be accepted', async () => {
    await share('near', cellAt(0));
    await open();
    await assert.rejects(respond(db, { pickupId: 'p', response: 'accept' }, 'near', { now: T0 + 6 * MIN }),
      (e) => e.details?.reason === 'offer_expired');
  });

  it('another chapter’s volunteer cannot accept', async () => {
    await db.doc('users/far').update({ chapter_id: 'ch2' });
    await share('near', cellAt(0));
    await open();
    await assert.rejects(respond(db, { pickupId: 'p', response: 'accept' }, 'far', { now: T0 + MIN }),
      (e) => e.details?.reason === 'other_chapter');
  });

  it('cancelling the donation withdraws outstanding offers', async () => {
    await share('near', cellAt(0));
    await open();
    await ref().update({ status: 'cancelled' });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, roadTimes: noRoads });
    assert.deepEqual(await openOfferUids(), []);
    assert.equal((await offers())[0].status, 'withdrawn');
    assert.equal((await state()).status, 'closed');
  });

  it('two runners racing on the same round produce one offer', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await ref().set(offer());
    await db.doc('pickups/p/dispatch/state').set({ generation: D.currentGeneration((await ref().get()).data()).key,
      status: 'searching', round: 0, ring_index: 0, alerted_count: 0, excluded_uids: [], next_action_at: Timestamp.fromMillis(T0) });
    const [a, b] = await Promise.all([tick(0), tick(0)]);
    assert.deepEqual([a.action, b.action].sort(), ['round', 'skipped']);
    assert.equal((await offers()).length, 1);
  });

  it('a release reopens with a new generation that skips the releaser', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    await respond(db, { pickupId: 'p', response: 'accept' }, 'near', { now: T0 + MIN });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, roadTimes: noRoads });
    await ref().update({ status: 'available', claimed_by: null, released_by: 'near', released_at: Timestamp.fromMillis(T0 + 3 * MIN) });
    const out = await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + 3 * MIN, roadTimes: noRoads });
    assert.deepEqual(out.recipients, ['mid']);
    assert.match((await state()).generation, /^release_/);
  });

  it('reminds a claimant who has not left and escalates once', async () => {
    await share('near', cellAt(0));
    await open();
    await respond(db, { pickupId: 'p', response: 'accept' }, 'near', { now: T0 + MIN });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, roadTimes: noRoads });
    assert.equal((await tick(105)).action, 'reminded');
    assert.equal((await tick(106)).action, 'none');
    assert.deepEqual(await noticesOfType('rescue_start_reminder'), ['near']);
  });

  it('a no-show release tells the volunteer once, and the donor when it closes', async () => {
    await db.doc('restaurants/r1').set({ user_id: 'donorUid' });
    await share('near', cellAt(0));
    await open();
    await ref().update({ status: 'cancelled', claimed_by: null, cancel_reason: 'Pickup window expired',
      abandoned_at: Timestamp.fromMillis(T0 + MIN), abandoned_prior_claimant: 'near' });
    const after = (await ref().get()).data();
    await D.onPickupChange(db, ref(), after, { now: T0 + MIN, roadTimes: noRoads });
    await D.onPickupChange(db, ref(), after, { now: T0 + MIN, roadTimes: noRoads });
    assert.deepEqual(await noticesOfType('pickup_auto_released'), ['near']);
    assert.deepEqual(await noticesOfType('pickup_closed'), ['donorUid']);
  });

  it('the scheduler only picks up rescues that are due', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    assert.equal((await D.advanceDue(db, { now: T0 + 30_000, roadTimes: noRoads })).length, 0);
    const due = await D.advanceDue(db, { now: T0 + 6 * MIN, roadTimes: noRoads });
    assert.deepEqual(due.map((r) => [r.pickupId, r.action]), [['p', 'round']]);
  });
});
