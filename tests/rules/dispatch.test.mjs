// Exclusive rescue offers (functions/rescueDispatch.js + rescueOffers.js)
// against the Firestore emulator with a fake clock and a deterministic
// routing fixture: one actionable offer at a time, early expiry at the last
// feasible start, decline/timeout advancing, bounded widening, exclusivity
// against direct takes, races, retries, stale offers and generations,
// cancellation, destination changes, and volunteers who get busy.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { latLngToCell, gridRingUnsafe } = require('h3-js');
const D = require('./rescueDispatch.js');
const { respond } = require('./rescueOffers.js');
const S = require('./receivingSites.js');

const PROJECT_ID = 'demo-bn-dispatch';
const MIN = 60_000;
const LAT = 35.1495, LNG = -90.049;
const SITE = [LAT + 0.02, LNG];
const ORIGIN = latLngToCell(LAT, LNG, 7);
const cellAt = (ring, i = 0) => (ring === 0 ? ORIGIN : gridRingUnsafe(ORIGIN, ring)[i]);
const T0 = Date.parse('2026-11-23T18:00:00Z');     // fixed fake clock

// Deterministic routing provider. `toDonor` maps an H3 cell to seconds (or
// null = no route); `toSite` is donor → site seconds (or null).
function fixture({ toDonor = {}, toSite = null, fail = false } = {}) {
  const calls = [];
  return {
    name: 'fixture', calls,
    async matrix({ origins, destination, profile }) {
      calls.push({ origins: origins.length, profile });
      if (fail) return { status: 'unavailable', error: 'timeout', seconds: origins.map(() => null) };
      const toSiteCall = Math.abs(destination[0] - SITE[0]) < 1e-9;
      const seconds = origins.map((o) => (toSiteCall ? toSite : toDonor[latLngToCell(o[0], o[1], 7)] ?? null));
      const got = seconds.filter((v) => v !== null).length;
      return { status: !got ? 'unavailable' : got === seconds.length ? 'ok' : 'partial', seconds };
    },
    async route() { return { status: 'unavailable', error: 'not_configured' }; },
  };
}
const noRoads = fixture({ fail: true });

let app, db;
before(() => { app = initializeApp({ projectId: PROJECT_ID }, 'dispatch-test'); db = getFirestore(app); });
after(async () => { await deleteApp(app); });

const volunteer = (extra = {}) => ({
  role: 'member', chapter_id: 'ch', member_status: 'approved', verification_status: 'approved', name: 'V',
  contract_volunteer_signed: true, driver_setup_complete: true, push_enabled: true, onesignal_player_id: 'p', ...extra,
});
async function share(uid, cell, ageMin = 5) {
  await db.doc(`rescue_availability/${uid}`).set({ cell, updated_at: Timestamp.fromMillis(T0 - ageMin * MIN) });
}
function rescue(extra = {}, pickupMin = 120, arrivalMin = 180) {
  return {
    status: 'available', chapter_id: 'ch', restaurant_id: 'r1', receiver_uid: 'site', claimed_by: null,
    restaurant_lat: LAT, restaurant_lng: LNG, fridge_lat: SITE[0], fridge_lng: SITE[1], estimated_weight_lbs: 20,
    destination_confirmation: {
      site_name: 'Pantry', site_id: 'site1', address: 'A', contact: 'C', confirmed_by: 'pres', accepted_weight_lbs: 20,
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
const noticesOfType = async (type) => (await db.collection('notifications').get()).docs
  .filter((d) => d.data().data?.type === type).map((d) => d.data().user_id).sort();
async function hold(arrivalMin = 180, extra = {}) {
  await db.doc('receiving_sites/site1/reservations/p').set({ status: 'held', day: '2026-11-23', packages: 2, weight_lbs: 20,
    expires_at: Timestamp.fromMillis(T0 + (arrivalMin + 30) * MIN), collected: false, ...extra });
}
async function open(extra = {}, { at = T0, routing = noRoads, pickupMin = 120, arrivalMin = 180 } = {}) {
  await ref().set(rescue(extra, pickupMin, arrivalMin));
  await hold(arrivalMin);
  return D.onPickupChange(db, ref(), (await ref().get()).data(), { now: at, routing });
}
const tick = (minutes, routing = noRoads) => D.advance(db, ref(), { now: T0 + minutes * MIN, routing });
const accept = (uid, minutes = 1, extra = {}) => respond(db, { pickupId: 'p', response: 'accept', ...extra }, uid, { now: T0 + minutes * MIN });
const reason = (r) => (e) => e.details?.reason === r;

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    ...Object.entries({
      near: volunteer(), near2: volunteer(), mid: volunteer(), far: volunteer(), pres: volunteer({ role: 'chapter_president' }),
      coord: volunteer({ roles: ['chapter_vol_coord'] }), exec: volunteer({ role: 'executive', chapter_id: 'hq' }),
    }).map(([uid, u]) => db.doc(`users/${uid}`).set(u)),
    db.doc('receiving_sites/site1').set({ name: 'Pantry', type: 'staffed_center', chapter_id: 'ch', status: 'active', lat: SITE[0], lng: SITE[1] }),
  ]);
});

describe('one exclusive offer at a time', () => {
  it('offers exactly one feasible volunteer and records who, which generation, and until when', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    const out = await open();
    assert.deepEqual(out.recipients, ['near']);
    const all = await offers();
    assert.equal(all.length, 1);
    const [o] = all;
    assert.equal(o.status, 'open'); assert.equal(o.uid, 'near'); assert.equal(o.pickup_id, 'p');
    assert.match(o.generation, /^open_/); assert.equal(o.offer_id, `${D.safeId(o.generation)}_near`);
    assert.ok(o.expires_at.toMillis() - T0 <= 5 * MIN);
    assert.equal(o.trip.basis, 'approximate'); assert.equal(o.trip.margin_minutes, 15); assert.equal(o.trip.origin, 'approximate_area');
    const p = (await ref().get()).data();
    assert.equal(p.offer_hold.offer_id, o.offer_id); assert.equal(p.offer_hold.uid, undefined);   // no identity on the rescue
    assert.deepEqual(await noticesOfType('rescue_offer'), ['near']);
  });

  it('a volunteer who can’t get push still gets the offer in the app, and dispatch says so', async () => {
    await db.doc('users/near').update({ push_enabled: false });
    await share('near', cellAt(0));
    await open();
    assert.equal((await state()).current_offer.push, 'in_app_only');
    assert.equal((await db.collection('notifications_outbox').get()).size, 0);
    assert.deepEqual(await openOfferUids(), ['near']);
  });

  it('when the only feasible volunteer is answering another offer, dispatch waits instead of escalating', async () => {
    await db.doc('pickups/other/offers/x_near').set({ uid: 'near', status: 'open', generation: 'x', expires_at: Timestamp.fromMillis(T0 + 3 * MIN) });
    await share('near', cellAt(0));
    const out = await open();
    assert.equal(out.action, 'waiting_for_volunteer');
    assert.equal((await state()).status, 'searching');
    assert.deepEqual(await noticesOfType('rescue_escalation'), []);
    await db.doc('pickups/other/offers/x_near').update({ status: 'declined' });
    assert.deepEqual((await tick(2)).recipients, ['near']);
  });

  it('a volunteer holding a live offer elsewhere is not offered a second rescue', async () => {
    await db.doc('pickups/other/offers/x_near').set({ uid: 'near', status: 'open', generation: 'x', expires_at: Timestamp.fromMillis(T0 + 3 * MIN) });
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    assert.deepEqual((await open()).recipients, ['mid']);
    assert.equal((await state()).last_round.skipped.has_offer, 1);
  });
});

describe('who gets the offer', () => {
  it('skips the closest volunteer whose vehicle can’t carry the load and offers one who can', async () => {
    await db.doc('users/near').update({ vehicle: { type: 'bike', package_capacity: 1, weight_capacity_lbs: 10, equipment: [] } });
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    assert.deepEqual((await open()).recipients, ['mid']);
    assert.equal((await state()).last_round.skipped.does_not_fit, 1);
  });

  it('ranks by road time when routing answers, not straight-line distance', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    const routing = fixture({ toDonor: { [cellAt(0)]: 3000, [cellAt(1)]: 600 }, toSite: 600 });
    assert.deepEqual((await open({}, { routing })).recipients, ['mid']);
    const [o] = await offers();
    assert.deepEqual(o.trip.legs, { to_pickup: 'road', to_site: 'road' });
    assert.equal(o.trip.basis, 'road'); assert.equal(o.trip.margin_minutes, 5);
  });

  it('a mixed road + approximate trip uses the 15-minute margin and is labeled approximate', async () => {
    await share('near', cellAt(0));
    const routing = fixture({ toDonor: { [cellAt(0)]: 300 }, toSite: null });
    await open({}, { routing });
    const [o] = await offers();
    assert.deepEqual(o.trip.legs, { to_pickup: 'road', to_site: 'approximate' });
    assert.equal(o.trip.margin_minutes, 15);
  });

  it('a partial matrix keeps the missing volunteer on a labeled estimate, never zero minutes', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    const routing = fixture({ toDonor: { [cellAt(1)]: 400 }, toSite: 600 });   // near's cell has no route
    await open({}, { routing });
    assert.equal((await state()).last_round.routing, 'mixed');
    const [o] = await offers();
    assert.equal(o.uid, 'near');
    assert.equal(o.trip.legs.to_pickup, 'approximate'); assert.equal(o.trip.margin_minutes, 15);
    assert.ok(o.trip.to_pickup_minutes >= 1);
  });

  it('routing failure falls back to labeled estimates, never a crash or a fake road ETA', async () => {
    await share('near', cellAt(0));
    assert.deepEqual((await open({}, { routing: fixture({ fail: true }) })).recipients, ['near']);
    assert.equal((await state()).last_round.routing, 'approximate');
    assert.equal((await offers())[0].trip.basis, 'approximate');
  });

  it('nobody can make a too-short window: no offer, the coordinator decides', async () => {
    await share('far', cellAt(6));
    const out = await open({}, { pickupMin: 45, arrivalMin: 90 });
    assert.equal(out.action, 'escalated'); assert.equal(out.reason, 'no_feasible_volunteer');
    assert.equal((await offers()).length, 0);
    assert.deepEqual(await noticesOfType('rescue_escalation'), ['coord', 'pres']);
  });

  it('opted-out, stale and unapproved volunteers are never offered', async () => {
    await db.doc('users/near').update({ notif_pickup: false });
    await db.doc('users/mid').update({ verification_status: 'pending' });
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(0)), share('far', cellAt(1), 90)]);
    assert.equal((await open()).action, 'escalated');
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

describe('offer timing', () => {
  it('ends early at the volunteer’s last feasible start, not a misleading five minutes', async () => {
    await share('near', cellAt(0));
    // Road: 10 min to donor, 10 min to site. Collection must finish by +38:
    // latest start = 38 - 5 margin - 10 loading - 10 travel = +13… unless the
    // receiving deadline is tighter: arrival +45 → 45-5-10-10-10-10 = 0.
    // Use arrival +47 so the latest start is +2 min.
    const routing = fixture({ toDonor: { [cellAt(0)]: 600 }, toSite: 600 });
    await open({}, { routing, pickupMin: 38, arrivalMin: 47 });
    const [o] = await offers();
    assert.equal(o.expires_at.toMillis(), T0 + 2 * MIN);
    assert.equal(o.expiry_reason, 'last_feasible_start');
  });

  it('does not send an offer with less than a minute left to start', async () => {
    await share('near', cellAt(0));
    const routing = fixture({ toDonor: { [cellAt(0)]: 600 }, toSite: 600 });
    const out = await open({}, { routing, pickupMin: 38, arrivalMin: 45.5 });
    assert.equal(out.action, 'escalated');
    assert.equal((await offers()).length, 0);
  });

  it('waits out the response window, then expires the offer and offers the next person', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    assert.equal((await tick(2)).action, 'waiting');
    assert.deepEqual((await tick(6)).recipients, ['mid']);
    assert.equal((await offers()).find((o) => o.uid === 'near').status, 'expired');
    const note = (await db.collection('notifications').where('user_id', '==', 'near').get()).docs[0].data();
    assert.equal(note.data.offer_status, 'expired');
  });

  it('a missed scheduler run never leaves an expired offer acceptable', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    // No advance ran at +5; the volunteer taps the old notification at +9.
    await assert.rejects(accept('near', 9), reason('offer_expired'));
    assert.deepEqual((await tick(9)).recipients, ['mid']);
  });
});

describe('responding', () => {
  it('declining moves to the next candidate immediately, without penalty', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    const out = await respond(db, { pickupId: 'p', response: 'decline' }, 'near', { now: T0 + MIN,
      advance: (d, r) => D.advance(d, r, { now: T0 + MIN, routing: noRoads }) });
    assert.equal(out.declined, true);
    assert.deepEqual(await openOfferUids(), ['mid']);
    assert.equal((await db.doc('users/near').get()).data().leaderboard_score, undefined);
  });

  it('an unoffered volunteer cannot take the rescue while the offer is live', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    await assert.rejects(accept('mid'), reason('offered_elsewhere'));
    assert.equal((await ref().get()).data().claimed_by, null);
  });

  it('the offered volunteer double-tapping produces one assignment', async () => {
    await share('near', cellAt(0));
    await open();
    const results = await Promise.allSettled([accept('near'), accept('near')]);
    assert.ok(results.every((r) => r.status === 'fulfilled'));
    const p = (await ref().get()).data();
    assert.equal(p.claimed_by, 'near'); assert.equal(p.claimed_via, 'offer'); assert.equal(p.offer_hold, null);
    assert.equal((await offers())[0].status, 'accepted');
  });

  it('a retried accept after a dropped connection returns the same result', async () => {
    await share('near', cellAt(0));
    await open();
    await accept('near');
    assert.equal((await accept('near')).cached, true);
  });

  it('a stale offer id is refused', async () => {
    await share('near', cellAt(0));
    await open();
    await assert.rejects(accept('near', 1, { offerId: 'open_1.0_near' }), reason('stale_offer'));
  });

  it('another chapter’s volunteer cannot accept', async () => {
    await db.doc('users/far').update({ chapter_id: 'ch2' });
    await share('near', cellAt(0));
    await open();
    await respond(db, { pickupId: 'p', response: 'decline' }, 'near', { now: T0 + MIN, advance: async () => {} });
    await share('far', cellAt(0));
    await assert.rejects(accept('far', 2), reason('other_chapter'));
  });

  it('a volunteer who takes another rescue during an offer loses it', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    const other = db.doc('pickups/other');
    await other.set({ status: 'claimed', claimed_by: 'near', chapter_id: 'ch' });
    await db.doc('pickups/other/dispatch/state').set({ generation: 'g', status: 'searching', round: 1 });
    await D.onPickupChange(db, other, (await other.get()).data(), { now: T0 + MIN, routing: noRoads });
    assert.equal((await offers())[0].status, 'withdrawn');
    await assert.rejects(accept('near', 2), reason('offer_closed'));
  });

  it('a direct take with no offer outstanding needs a shared area and a feasible trip', async () => {
    await open();                                    // nobody shared: escalated, no offer
    assert.equal((await state()).status, 'escalated');
    await assert.rejects(accept('mid'), reason('area_needed'));
    await share('mid', cellAt(1));
    await accept('mid');
    assert.equal((await ref().get()).data().claimed_via, 'direct');
  });
});

describe('search expansion', () => {
  it('offers every nearby candidate before widening, then escalates', async () => {
    await Promise.all([share('near', cellAt(0)), share('near2', cellAt(1)), share('far', cellAt(3))]);
    assert.deepEqual((await open()).recipients, ['near']);
    assert.deepEqual((await tick(6)).recipients, ['near2']);
    assert.equal((await state()).ring_index, 0);
    assert.deepEqual((await tick(12)).recipients, ['far']);
    assert.equal((await state()).ring_index, 1);
    const end = await tick(18);
    assert.equal(end.action, 'escalated'); assert.equal(end.reason, 'no_acceptance');
  });

  it('two runners racing on the same round produce one offer', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await ref().set(rescue());
    await hold();
    await db.doc('pickups/p/dispatch/state').set({ generation: D.currentGeneration((await ref().get()).data()).key,
      status: 'searching', round: 0, ring_index: 0, alerted_count: 0, excluded_uids: [], next_action_at: Timestamp.fromMillis(T0) });
    const [a, b] = await Promise.all([tick(0), tick(0)]);
    assert.deepEqual([a.action, b.action].sort(), ['round', 'skipped']);
    assert.equal((await offers()).length, 1);
  });

  it('a delayed trigger from an older generation does not reopen or reset the newer one', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    const oldSnapshot = (await ref().get()).data();
    await accept('near');
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, routing: noRoads });
    await ref().update({ status: 'available', claimed_by: null, released_by: 'near', released_at: Timestamp.fromMillis(T0 + 3 * MIN) });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + 3 * MIN, routing: noRoads });
    const fresh = await state();
    assert.match(fresh.generation, /^release_/);
    // The original "offer opened" event is delivered again, late.
    const out = await D.onPickupChange(db, ref(), oldSnapshot, { now: T0 + 4 * MIN, routing: noRoads });
    assert.equal(out.action, 'none');
    const after = await state();
    assert.equal(after.generation, fresh.generation); assert.equal(after.round, fresh.round);
  });
});

describe('changes that invalidate offers', () => {
  it('cancelling the donation withdraws the outstanding offer', async () => {
    await share('near', cellAt(0));
    await open();
    await ref().update({ status: 'cancelled' });
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, routing: noRoads });
    assert.deepEqual(await openOfferUids(), []);
    assert.equal((await offers())[0].status, 'withdrawn');
    assert.equal((await state()).status, 'closed');
  });

  it('a lapsed receiving hold blocks acceptance and escalates instead of re-offering', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    await db.doc('receiving_sites/site1/reservations/p').update({ status: 'released' });
    await assert.rejects(accept('near'), reason('reservation'));
    const out = await tick(6);
    assert.equal(out.action, 'escalated'); assert.equal(out.reason, 'destination_unusable');
  });

  it('a rescue without a saved receiving site is never offered or claimable', async () => {
    await share('near', cellAt(0));
    const dc = rescue().destination_confirmation;
    delete dc.site_id;
    const out = await open({ destination_confirmation: dc });
    assert.equal(out.action, 'none');
    await assert.rejects(accept('near'), reason('no_destination'));
  });

  it('a release reopens with a new generation that skips the releaser and rechecks the hold', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    await accept('near');
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, routing: noRoads });
    await ref().update({ status: 'available', claimed_by: null, released_by: 'near', released_at: Timestamp.fromMillis(T0 + 3 * MIN) });
    const out = await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + 3 * MIN, routing: noRoads });
    assert.deepEqual(out.recipients, ['mid']);
    assert.match((await state()).generation, /^release_/);
  });
});

describe('after assignment', () => {
  it('reminds a claimant who has not left and escalates once', async () => {
    await share('near', cellAt(0));
    await open();
    await accept('near');
    await D.onPickupChange(db, ref(), (await ref().get()).data(), { now: T0 + MIN, routing: noRoads });
    assert.equal((await tick(105)).action, 'reminded');
    assert.equal((await tick(106)).action, 'none');
    assert.deepEqual(await noticesOfType('rescue_start_reminder'), ['near']);
  });

  it('tells the donor once a volunteer accepts', async () => {
    await db.doc('restaurants/r1').set({ user_id: 'donorUid' });
    await share('near', cellAt(0));
    await open();
    await accept('near');
    assert.deepEqual(await noticesOfType('pickup_claimed_restaurant'), ['donorUid']);
  });

  it('a no-show release tells the volunteer once, and the donor when it closes', async () => {
    await db.doc('restaurants/r1').set({ user_id: 'donorUid' });
    await share('near', cellAt(0));
    await open();
    await ref().update({ status: 'cancelled', claimed_by: null, cancel_reason: 'Pickup window expired',
      abandoned_at: Timestamp.fromMillis(T0 + MIN), abandoned_prior_claimant: 'near' });
    const afterDoc = (await ref().get()).data();
    await D.onPickupChange(db, ref(), afterDoc, { now: T0 + MIN, routing: noRoads });
    await D.onPickupChange(db, ref(), afterDoc, { now: T0 + MIN, routing: noRoads });
    assert.deepEqual(await noticesOfType('pickup_auto_released'), ['near']);
    assert.deepEqual(await noticesOfType('pickup_closed'), ['donorUid']);
  });

  it('the scheduler only picks up rescues that are due', async () => {
    await Promise.all([share('near', cellAt(0)), share('mid', cellAt(1))]);
    await open();
    assert.equal((await D.advanceDue(db, { now: T0 + 30_000, routing: noRoads })).length, 0);
    const due = await D.advanceDue(db, { now: T0 + 6 * MIN, routing: noRoads });
    assert.deepEqual(due.map((r) => [r.pickupId, r.action]), [['p', 'round']]);
  });
});

describe('capacity holds after the receiving deadline', () => {
  it('an uncollected hold expires and stops counting; a collected one becomes overdue and keeps counting', async () => {
    await ref().set(rescue());
    await hold(180);
    await db.doc('pickups/q').set(rescue({ verified_by_restaurant_at: Timestamp.fromMillis(T0), status: 'enroute', claimed_by: 'near' }));
    await db.doc('receiving_sites/site1/reservations/q').set({ status: 'held', day: '2026-11-23', packages: 3, weight_lbs: 30,
      expires_at: Timestamp.fromMillis(T0 + 210 * MIN), collected: true });
    const out = await S.sweepReservations(db, { now: T0 + 211 * MIN });
    assert.deepEqual(out, { expired: 1, overdue: 1 });
    assert.equal((await db.doc('receiving_sites/site1/reservations/p').get()).data().status, 'expired');
    assert.equal((await db.doc('receiving_sites/site1/reservations/q').get()).data().status, 'overdue');
    // Running again changes nothing (no double release).
    assert.deepEqual(await S.sweepReservations(db, { now: T0 + 212 * MIN }), { expired: 0, overdue: 0 });
  });
});
