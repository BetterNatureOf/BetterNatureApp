// Rescue dispatch: one exclusive volunteer offer at a time, bounded search
// expansion when nobody can or will take it, recovery after a release, and
// coordinator escalation before the usable window closes.
//
// Offers: pickups/{id}/offers/{generation}_{uid} (server-only). Only the
// offered volunteer can accept while the offer is open; acceptance runs in
// rescueOffers.respond. The pickup carries `offer_hold` (expiry only, no
// identity) so other volunteers see the rescue is spoken for.
//
// State lives at pickups/{id}/dispatch/state (server-only, readable by
// chapter staff). Each time an offer (re)opens a new *generation*
// starts: the first destination confirmation, a volunteer release, or
// an executive abandonment release. Within a generation nobody is
// alerted twice (pickups/{id}/dispatch_alerts/{gen}_{uid}), every round
// runs in a transaction that re-checks the round number, and every
// notification uses a deterministic document id — so trigger retries,
// overlapping scheduler runs and stale clients can't double-alert.
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { latLngToCell, gridDisk, cellToLatLng, greatCircleDistance } = require('h3-js');
const { pickupEligible } = require('./lib/pickupEligibility');
const { routingProvider } = require('./dispatchRouting');
const { cargoFit } = require('./lib/rescueCargo');
const { POLICY } = require('./lib/rescuePolicy');
const { journey, tripInputs, siteLeg, pickupLegs, travelProfile } = require('./rescueMatching');

const MINUTE = 60_000;
const RESOLUTION = 7;                 // ~1.2 km hex edge
// Offer policy (lib/rescuePolicy.js): one volunteer at a time, at most
// five minutes, and never past that volunteer's last feasible start.
const OFFER_TTL_MS = POLICY.OFFER_MAX_RESPONSE_MIN * MINUTE;
const OFFER_MIN_MS = POLICY.OFFER_MIN_RESPONSE_MIN * MINUTE;
const MAX_OFFERS_PER_GENERATION = 12;
const RECENT_OFFER_MS = 30 * 60_000;  // soft fairness tie-break, never an exclusion
const ROUNDS = [                      // k = grid-disk radius in res-7 cells (search widens)
  { k: 2, limit: 8 },                 // ~5 km
  { k: 4, limit: 8 },                 // ~10 km
  { k: 7, limit: 10 },                // ~17 km
];
const AVAILABILITY_MS = 60 * MINUTE;  // shared-area freshness
const ESCALATE_BEFORE_MS = 30 * MINUTE;
const MIN_ALERT_LEAD_MS = 15 * MINUTE;
const START_REMINDER_BEFORE_MS = 20 * MINUTE;
const MIN_ROUND_GAP_MS = 3 * MINUTE;
const MAX_ROUND_GAP_MS = 10 * MINUTE;
const EMPTY_ROUND_GAP_MS = 1 * MINUTE;
const IN_QUERY_LIMIT = 30;
const MAX_CANDIDATES = 120;
const COORDINATOR_ROLES = ['chapter_president', 'chapter_pres', 'chapter_vol_coord'];
const EXEC_ROLES = ['executive', 'admin', 'super_admin'];
const ALERT_KIND = 'pickup_alert';

const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : Number.isFinite(v) ? v : NaN);
const stamp = (v) => (v?.toMillis ? `${v.seconds}.${v.nanoseconds}` : null);
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 300);
const rolesOf = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];

function offerDeadline(p) {
  return Math.min(ms(p?.destination_confirmation?.pickup_by ?? p?.pickup_window_until),
    ms(p?.destination_confirmation?.arrival_by));
}

// A rescue volunteers can still take: open, unclaimed, not held, and with
// a confirmed saved receiving site (a free-text destination from older
// clients is not usable; the coordinator queue lists those).
function offerIsOpen(p, now) {
  return p?.status === 'available' && !!p.chapter_id && !p.claimed_by && !!p.destination_confirmation?.site_id &&
    !p.safety_hold && !p.verified_by_restaurant_at && offerDeadline(p) > now;
}

// The receiving site's capacity hold for this rescue is still usable.
function reservationUsable(res, now) {
  return res?.status === 'held' && !(Number.isFinite(ms(res.expires_at)) && ms(res.expires_at) <= now);
}

// The event that most recently (re)opened the offer, and who to skip.
function currentGeneration(p) {
  const events = [
    { source: 'open', at: p?.destination_confirmation?.confirmed_at, exclude: null },
    { source: 'release', at: p?.released_at, exclude: p?.released_by },
    { source: 'abandon', at: p?.abandoned_at, exclude: p?.abandoned_prior_claimant },
  ].filter((e) => stamp(e.at));
  if (!events.length) return null;
  events.sort((a, b) => ms(b.at) - ms(a.at));
  const e = events[0];
  return { key: `${e.source}_${stamp(e.at)}`, source: e.source, exclude: e.exclude ? [e.exclude] : [] };
}

function wantsAlert(user, pickup) {
  return !!user && user.chapter_id === pickup.chapter_id && user.notif_pickup !== false &&
    pickupEligible(user) && !rolesOf(user).some((r) => ['restaurant', 'partner'].includes(r));
}

function roundGap(deadline, now, roundsLeft) {
  const usable = deadline - ESCALATE_BEFORE_MS - now;
  return Math.max(MIN_ROUND_GAP_MS, Math.min(MAX_ROUND_GAP_MS, usable / Math.max(1, roundsLeft)));
}

const pickupUrl = (id) => `https://app.betternatureofficial.org/#/pickups/${encodeURIComponent(id)}`;

// Bell + outbox rows with deterministic ids. tx.create would abort the
// whole transaction on a replay, so existence is checked by the caller.
function writeNotice(tx, db, id, { uid, kind, title, body, url, data, push = true }) {
  const row = { user_id: uid, kind, title, body, url, data, created_at: FieldValue.serverTimestamp() };
  tx.set(db.collection('notifications').doc(id), { ...row, read: false });
  if (push) tx.set(db.collection('notifications_outbox').doc(id), { ...row, status: 'queued', attempts: 0, idempotency_key: id });
}

async function availabilityNear(db, cells) {
  const out = [];
  for (let i = 0; i < cells.length; i += IN_QUERY_LIMIT) {
    const snap = await db.collection('rescue_availability').where('cell', 'in', cells.slice(i, i + IN_QUERY_LIMIT)).get();
    out.push(...snap.docs);
  }
  return out;
}

async function coordinatorsFor(db, chapterId) {
  const staff = chapterId
    ? (await db.collection('users').where('chapter_id', '==', chapterId).get()).docs
      .filter((d) => rolesOf(d.data()).some((r) => COORDINATOR_ROLES.includes(r)) && !d.data().disabled)
    : [];
  if (staff.length) return staff.map((d) => d.id).sort();
  const execs = await db.collection('users').where('role', 'in', EXEC_ROLES).get();
  return execs.docs.filter((d) => !d.data().disabled).map((d) => d.id).sort();
}

// ── Trigger: pickups/{id} onUpdate/onCreate ─────────────────────────
// Starts a generation when an offer (re)opens; tracks claim / start.
async function onPickupChange(db, pickupRef, after, { now = Date.now(), routing = routingProvider() } = {}) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
  await noticeNoShowRelease(db, pickupRef, after);
  const gen = currentGeneration(after);
  if (offerIsOpen(after, now) && gen) {
    const started = await db.runTransaction(async (tx) => {
      const [state, pickup] = await Promise.all([tx.get(stateRef), tx.get(pickupRef)]);
      const current = pickup.data();
      const g = currentGeneration(current);
      if (!offerIsOpen(current, now) || !g || g.key !== gen.key) return false;
      if (state.exists && state.data().generation === gen.key) return false;
      tx.set(stateRef, {
        generation: gen.key, generation_source: gen.source, excluded_uids: gen.exclude,
        chapter_id: current.chapter_id, status: 'searching', round: 0, alerted_count: 0,
        last_round: null, escalation: null, start_reminder_at: null,
        next_action_at: Timestamp.fromMillis(now), offer_deadline: Timestamp.fromMillis(offerDeadline(current)),
        generation_started_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (started) return advance(db, pickupRef, { now, routing });
    return { action: 'none' };
  }
  // Claimed: watch for a volunteer who hasn't left before the cutoff.
  // Claimed, cancelled or started: withdraw every other open offer.
  const outcome = await db.runTransaction(async (tx) => {
    const state = await tx.get(stateRef);
    if (!state.exists) return { action: 'none' };
    const s = state.data();
    const pickup = (await tx.get(pickupRef)).data();
    if (pickup?.status === 'claimed' && pickup.claimed_by) {
      if (s.status === 'assigned' && s.assigned_to === pickup.claimed_by) return { action: 'none', generation: s.generation };
      const pickupBy = ms(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until);
      tx.update(stateRef, { status: 'assigned', assigned_to: pickup.claimed_by, start_reminder_at: null,
        next_action_at: Number.isFinite(pickupBy) ? Timestamp.fromMillis(pickupBy - START_REMINDER_BEFORE_MS) : null,
        updated_at: FieldValue.serverTimestamp() });
      return { action: 'assigned', generation: s.generation, keep: pickup.claimed_by, claimer: pickup.claimed_by };
    }
    if (['searching', 'assigned', 'escalated'].includes(s.status) && !offerIsOpen(pickup, now)) {
      tx.update(stateRef, { status: pickup?.status === 'enroute' ? 'in_progress' : 'closed',
        next_action_at: null, updated_at: FieldValue.serverTimestamp() });
      return { action: 'closed', generation: s.generation };
    }
    return { action: 'none', generation: s.generation };
  });
  if (outcome.generation && outcome.action !== 'none' || (outcome.generation && after?.status !== 'available')) {
    await closeOffers(db, pickupRef, outcome.generation, 'withdrawn', now, outcome.keep || after?.claimed_by || null);
  }
  if (outcome.claimer) await closeOffersForVolunteer(db, outcome.claimer, pickupRef.id, now);
  return outcome;
}

// A coordinator released a no-show claim: tell the volunteer (and the
// donor if the offer closed). Clients can't notify other members under
// A2, so this runs here, once per release.
async function noticeNoShowRelease(db, pickupRef, p) {
  const key = stamp(p?.abandoned_at);
  if (!key || !p.abandoned_prior_claimant) return;
  let donor = null;
  if (p.status === 'cancelled' && p.restaurant_id && !String(p.restaurant_id).includes('/')) {
    donor = (await db.collection('restaurants').doc(p.restaurant_id).get()).data()?.user_id || null;
  }
  await db.runTransaction(async (tx) => {
    const id = `rescue_released_${safeId(pickupRef.id)}_${safeId(key)}`;
    if ((await tx.get(db.collection('notifications').doc(id))).exists) return;
    writeNotice(tx, db, id, { uid: p.abandoned_prior_claimant, kind: 'pickup', title: 'Your claim was released',
      body: p.status === 'cancelled' ? 'The pickup window passed, so a coordinator closed this rescue. No penalty.'
        : 'A coordinator released your claim so someone else can take this rescue. No penalty.',
      url: pickupUrl(pickupRef.id), data: { type: 'pickup_auto_released', pickupId: pickupRef.id } });
    if (donor) {
      writeNotice(tx, db, `${id}_donor`, { uid: donor, kind: 'pickup', title: 'Pickup closed',
        body: 'The volunteer couldn’t make the pickup window, so this rescue closed. Post again if the food is still available.',
        url: pickupUrl(pickupRef.id), data: { type: 'pickup_closed', pickupId: pickupRef.id } });
    }
  });
}

// ── Scheduler step for one pickup ───────────────────────────────────
async function advance(db, pickupRef, { now = Date.now(), routing = routingProvider() } = {}) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const [stateSnap, pickupSnap] = await Promise.all([stateRef.get(), pickupRef.get()]);
  if (!stateSnap.exists || !pickupSnap.exists) return { action: 'none' };
  const s = stateSnap.data(), p = pickupSnap.data();

  if (s.status === 'assigned') return startReminder(db, pickupRef, s, { now });
  if (s.status !== 'searching') return { action: 'none' };
  const gen = currentGeneration(p);
  if (!offerIsOpen(p, now) || !gen || gen.key !== s.generation) {
    await closeOffers(db, pickupRef, s.generation, 'withdrawn', now);
    return closeIf(db, stateRef, s.generation, (state) => state.status === 'searching', now);
  }
  // Volunteers holding a live offer get their full response window.
  const open = await openOffers(db, pickupRef, s.generation);
  if (open.some((o) => ms(o.data().expires_at) > now)) return { action: 'waiting', open: open.length };
  if (open.length) await closeOffers(db, pickupRef, s.generation, 'expired', now);

  const deadline = offerDeadline(p);
  if ((s.alerted_count || 0) >= MAX_OFFERS_PER_GENERATION) return escalate(db, pickupRef, s.generation, 'no_acceptance', { now });
  if (deadline - now <= ESCALATE_BEFORE_MS) return escalate(db, pickupRef, s.generation, 'deadline_approaching', { now });
  if (deadline - now <= MIN_ALERT_LEAD_MS) return escalate(db, pickupRef, s.generation, 'deadline_approaching', { now });
  return runRound(db, pickupRef, s, p, { now, routing });
}

async function openOffers(db, pickupRef, generation) {
  const snap = await pickupRef.collection('offers').where('generation', '==', generation).where('status', '==', 'open').get();
  return snap.docs;
}

// Close every open offer in a generation (expired / withdrawn) and take
// the matching notifications out of the actionable UI.
async function closeOffers(db, pickupRef, generation, status, now, exceptUid = null, onlyId = null) {
  const docs = (await openOffers(db, pickupRef, generation))
    .filter((d) => d.data().uid !== exceptUid && (!onlyId || d.id === onlyId));
  for (const d of docs) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(d.ref);
      if (fresh.data()?.status !== 'open') return;
      const noteRef = db.collection('notifications').doc(fresh.data().notification_id);
      const note = await tx.get(noteRef);
      const pk = await tx.get(pickupRef);
      tx.update(d.ref, { status, closed_at: Timestamp.fromMillis(now) });
      if (pk.data()?.offer_hold?.offer_id === fresh.data().offer_id) tx.update(pickupRef, { offer_hold: null });
      if (note.exists) {
        tx.update(noteRef, { 'data.offer_status': status, title: status === 'expired' ? 'Rescue offer expired' : 'Rescue no longer available' });
      }
    });
  }
  return docs.length;
}

// A volunteer took another rescue: their open offers elsewhere close.
async function closeOffersForVolunteer(db, uid, exceptPickupId, now) {
  const snap = await db.collectionGroup('offers').where('uid', '==', uid).where('status', '==', 'open').get();
  let n = 0;
  for (const d of snap.docs) {
    const pickupRef = d.ref.parent.parent;
    if (pickupRef.id === exceptPickupId) continue;
    n += await closeOffers(db, pickupRef, d.data().generation, 'withdrawn', now, null, d.id);
    await pickupRef.collection('dispatch').doc('state').update({ next_action_at: Timestamp.fromMillis(now) }).catch(() => {});
  }
  return n;
}

async function closeIf(db, stateRef, generation, predicate, now) {
  return db.runTransaction(async (tx) => {
    const st = await tx.get(stateRef);
    if (!st.exists || st.data().generation !== generation || !predicate(st.data())) return { action: 'none' };
    tx.update(stateRef, { status: 'closed', next_action_at: null, updated_at: FieldValue.serverTimestamp() });
    return { action: 'closed' };
  });
}

// One offer round. H3 rings only build the shortlist; every candidate must
// then pass eligibility, chapter, cargo fit, "no other rescue or live
// offer", and a complete feasible journey from their shared area. The best
// single candidate gets an exclusive offer that ends at five minutes or at
// their last feasible start, whichever is sooner. The ring widens only when
// nobody in the current ring can do it.
async function runRound(db, pickupRef, s, p, { now, routing }) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const inputs = tripInputs(p, null);
  const located = !!inputs.donor;
  const siteId = p.destination_confirmation?.site_id;
  const site = siteId ? (await db.doc(`receiving_sites/${siteId}`).get()).data() : null;
  Object.assign(inputs, tripInputs(p, site));

  let ringIndex = s.ring_index || 0;
  let cells = [], candidates = [], legs = new Map(), siteLegs = new Map(), routingStatus = 'none', profiles = new Map();
  // Network and wide reads stay outside the transaction (retries re-run it).
  async function load(index) {
    cells = gridDisk(latLngToCell(inputs.donor[0], inputs.donor[1], RESOLUTION), ROUNDS[index].k);
    const near = await availabilityNear(db, cells);
    // Nearest areas first, so a wide ring never crowds out close volunteers.
    near.sort((a, b) => greatCircleDistance(inputs.donor, cellToLatLng(a.data().cell), 'km') -
      greatCircleDistance(inputs.donor, cellToLatLng(b.data().cell), 'km') || a.id.localeCompare(b.id));
    candidates = near.slice(0, MAX_CANDIDATES);
    profiles = new Map();
    for (let i = 0; i < candidates.length; i += 100) {
      const users = await db.getAll(...candidates.slice(i, i + 100).map((c) => db.collection('users').doc(c.id)));
      users.forEach((u) => profiles.set(u.id, travelProfile(u.data()).profile));
    }
    const wants = candidates.map((c) => ({ cell: c.data().cell, profile: profiles.get(c.id) || 'driving' }));
    const out = await pickupLegs(routing, inputs, wants);
    legs = out.legs; routingStatus = out.status;
    siteLegs = new Map();
    for (const profile of new Set(wants.map((w) => w.profile))) siteLegs.set(profile, await siteLeg(routing, inputs, profile));
  }
  if (located) await load(ringIndex);

  const result = await db.runTransaction(async (tx) => {
    const [stSnap, pkSnap] = await Promise.all([tx.get(stateRef), tx.get(pickupRef)]);
    const st = stSnap.data(), current = pkSnap.data();
    // Another runner already took this round, or the rescue changed.
    if (!st || st.status !== 'searching' || st.generation !== s.generation || st.round !== s.round) return { action: 'skipped' };
    const gen = currentGeneration(current);
    if (!offerIsOpen(current, now) || !gen || gen.key !== st.generation) return { action: 'skipped' };
    const res = (await tx.get(db.doc(`receiving_sites/${current.destination_confirmation.site_id}/reservations/${pickupRef.id}`))).data();
    if (!reservationUsable(res, now)) return { action: 'unusable_destination' };

    const ring = new Set(cells);
    const excluded = new Set([...(st.excluded_uids || []), current.receiver_uid, current.restaurant_user_id,
      current.restaurant_id, current.released_by, current.abandoned_prior_claimant].filter(Boolean));
    const genId = safeId(st.generation);
    const skipped = { excluded: 0, already_offered: 0, stale: 0, ineligible: 0, busy: 0, has_offer: 0, does_not_fit: 0,
      cannot_make_it: 0, unknown_travel: 0 };
    let unknownFit = 0;
    const feasible = [];
    for (const c of candidates) {
      const uid = c.id;
      const avail = (await tx.get(c.ref)).data();
      const updated = ms(avail?.updated_at);
      if (!avail || !ring.has(avail.cell) || !(updated <= now && updated > now - AVAILABILITY_MS)) { skipped.stale++; continue; }
      if (excluded.has(uid)) { skipped.excluded++; continue; }
      const offerRef = pickupRef.collection('offers').doc(`${genId}_${safeId(uid)}`);
      if ((await tx.get(offerRef)).exists) { skipped.already_offered++; continue; }
      const user = (await tx.get(db.collection('users').doc(uid))).data();
      if (!wantsAlert(user, current)) { skipped.ineligible++; continue; }
      const fit = cargoFit(current, user);
      if (fit.status === 'does_not_fit') { skipped.does_not_fit++; continue; }
      const busy = await tx.get(db.collection('pickups').where('claimed_by', '==', uid)
        .where('status', 'in', ['claimed', 'enroute']).limit(1));
      if (!busy.empty) { skipped.busy++; continue; }
      // One live offer per volunteer, across all rescues.
      const held = await tx.get(db.collectionGroup('offers').where('uid', '==', uid).where('status', '==', 'open'));
      if (held.docs.some((o) => ms(o.data().expires_at) > now)) { skipped.has_offer++; continue; }
      const { profile, assumed } = travelProfile(user);
      const toPickup = legs.get(`${profile}|${avail.cell}`) || null;
      const trip = journey({ now, toPickup, toSite: siteLegs.get(profile) || null, readyAt: inputs.readyAt,
        pickupBy: inputs.pickupBy, arrivalBy: inputs.arrivalBy, siteOpensAt: inputs.siteOpensAt });
      if (trip.feasible === null) { skipped.unknown_travel++; continue; }
      if (trip.feasible === false || trip.latestStartAt - now < OFFER_MIN_MS) { skipped.cannot_make_it++; continue; }
      if (fit.status === 'unknown') unknownFit++;
      const recent = ms(user.last_rescue_offer_at) > now - RECENT_OFFER_MS;
      feasible.push({ uid, user, offerRef, trip, profile, assumed, recent });
    }
    // Earliest handoff, then less driving, then more slack, then people who
    // weren't just offered something, then a stable id order.
    feasible.sort((a, b) => a.trip.finishAt - b.trip.finishAt ||
      a.trip.toPickupMinutes - b.trip.toPickupMinutes || b.trip.slackMinutes - a.trip.slackMinutes ||
      Number(a.recent) - Number(b.recent) || a.uid.localeCompare(b.uid));
    const chosen = feasible[0];
    if (!chosen) return { action: 'empty', skipped, unknownFit };

    const roundNo = st.round + 1;
    const { uid, user, offerRef, trip, profile, assumed } = chosen;
    const expiresAt = Math.min(now + OFFER_TTL_MS, trip.latestStartAt);
    const noteId = `rescue_offer_${safeId(pickupRef.id)}_${genId}_${safeId(uid)}`;
    const offerId = `${genId}_${safeId(uid)}`;
    tx.create(offerRef, {
      offer_id: offerId, pickup_id: pickupRef.id, uid, generation: st.generation, round: roundNo, status: 'open',
      expires_at: Timestamp.fromMillis(expiresAt), created_at: Timestamp.fromMillis(now), notification_id: noteId,
      expiry_reason: expiresAt < now + OFFER_TTL_MS ? 'last_feasible_start' : 'response_window',
      trip: { basis: trip.basis, profile, profile_assumed: assumed, legs: trip.legs, margin_minutes: trip.marginMinutes,
        to_pickup_minutes: trip.toPickupMinutes, to_site_minutes: trip.toSiteMinutes, wait_minutes: trip.waitMinutes,
        total_minutes: trip.totalMinutes, latest_start_at: Timestamp.fromMillis(trip.latestStartAt),
        origin: 'approximate_area' },
    });
    tx.set(db.collection('users').doc(uid), { last_rescue_offer_at: Timestamp.fromMillis(now) }, { merge: true });
    // Everyone else sees the rescue is spoken for until this time (no identity).
    tx.update(pickupRef, { offer_hold: { expires_at: Timestamp.fromMillis(expiresAt), offer_id: offerId } });
    const pushable = user.push_enabled === true && !!user.onesignal_player_id;
    writeNotice(tx, db, noteId, {
      uid, kind: ALERT_KIND, title: 'Rescue offer for you',
      body: 'A nearby rescue fits your route. Review the stops and timing, then accept or pass.',
      url: pickupUrl(pickupRef.id),
      data: { type: 'rescue_offer', pickupId: pickupRef.id, offer_id: offerId, offer_status: 'open', expires_at: new Date(expiresAt).toISOString() },
      push: pushable,
    });
    tx.update(stateRef, {
      round: roundNo, ring_index: ringIndex, alerted_count: (st.alerted_count || 0) + 1,
      current_offer: { uid, offer_id: offerId, expires_at: Timestamp.fromMillis(expiresAt), push: pushable ? 'queued' : 'in_app_only' },
      last_round: { round: roundNo, radius_cells: ROUNDS[ringIndex].k, recipients: 1, offered: [uid],
        ranking: 'journey', routing: routingStatus, location: located ? 'known' : 'missing', skipped, cargo_unknown: unknownFit,
        at: Timestamp.fromMillis(now) },
      next_action_at: Timestamp.fromMillis(expiresAt), updated_at: FieldValue.serverTimestamp(),
    });
    return { action: 'round', round: roundNo, recipients: [uid], expiresAt };
  });

  if (result.action === 'unusable_destination') return escalate(db, pickupRef, s.generation, 'destination_unusable', { now });
  if (result.action !== 'empty') return result;
  // Nobody feasible in this ring: widen while there is a wider ring.
  if (located && ringIndex < ROUNDS.length - 1) {
    await db.runTransaction(async (tx) => {
      const st = (await tx.get(stateRef)).data();
      if (st?.generation === s.generation && st.round === s.round && (st.ring_index || 0) === ringIndex) {
        tx.update(stateRef, { ring_index: ringIndex + 1, updated_at: FieldValue.serverTimestamp() });
      }
    });
    return runRound(db, pickupRef, { ...s, ring_index: ringIndex + 1 }, p, { now, routing });
  }
  // Searched as wide as allowed. Record why, then hand to a coordinator.
  await db.runTransaction(async (tx) => {
    const st = (await tx.get(stateRef)).data();
    if (st?.generation !== s.generation || st.round !== s.round) return;
    tx.update(stateRef, { last_round: { round: st.round, radius_cells: located ? ROUNDS[ringIndex].k : null, recipients: 0, offered: [],
      ranking: 'journey', routing: routingStatus, location: located ? 'known' : 'missing', skipped: result.skipped || null,
      cargo_unknown: result.unknownFit || 0, at: Timestamp.fromMillis(now) }, updated_at: FieldValue.serverTimestamp() });
  });
  const sk = result.skipped || {};
  // Someone who could do it is busy answering another offer: wait for that
  // offer to resolve (bounded by the deadline checks in advance) rather
  // than calling it infeasible.
  if (located && sk.has_offer > 0) {
    const retryAt = now + EMPTY_ROUND_GAP_MS * 2;
    await db.runTransaction(async (tx) => {
      const st = (await tx.get(stateRef)).data();
      if (st?.generation === s.generation && st.round === s.round && st.status === 'searching') {
        tx.update(stateRef, { next_action_at: Timestamp.fromMillis(retryAt), waiting_on: 'volunteer_answering_other_offer', updated_at: FieldValue.serverTimestamp() });
      }
    });
    return { action: 'waiting_for_volunteer', retryAt };
  }
  const reason = !located ? 'donor_location_missing'
    : (s.alerted_count || 0) > 0 ? 'no_acceptance'
      : sk.unknown_travel > 0 && !sk.cannot_make_it ? 'feasibility_unknown' : 'no_feasible_volunteer';
  return escalate(db, pickupRef, s.generation, reason, { now });
}

async function escalate(db, pickupRef, generation, reason, { now }) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const pickup = (await pickupRef.get()).data();
  const coordinators = await coordinatorsFor(db, pickup?.chapter_id);
  return db.runTransaction(async (tx) => {
    const st = (await tx.get(stateRef)).data();
    if (!st || st.generation !== generation || st.escalation) return { action: 'none' };
    const body = reason === 'destination_unusable'
      ? 'The receiving site’s capacity hold lapsed or the destination is no longer usable. Reconfirm a site or close the rescue.'
      : reason === 'feasibility_unknown'
      ? 'Travel times for this rescue couldn’t be established, so it wasn’t offered automatically. Assign a volunteer yourself or close it.'
      : reason === 'donor_location_missing'
      ? 'The donor’s location is missing, so nearby volunteers can’t be found. Assign a volunteer yourself.'
      : reason === 'no_feasible_volunteer'
      ? 'No available volunteer nearby can complete this rescue in time. Review it and decide the next step.'
      : reason === 'no_acceptance'
      ? 'No nearby volunteer has accepted this rescue. Review it and decide the next step.'
      : reason === 'not_started'
        ? 'The assigned volunteer has not started and the pickup cutoff is close.'
        : 'This rescue is close to its deadline without a volunteer.';
    for (const uid of coordinators) {
      writeNotice(tx, db, `rescue_escalation_${safeId(pickupRef.id)}_${safeId(generation)}_${safeId(uid)}`, {
        uid, kind: 'pickup', title: 'Rescue needs a decision', body,
        url: pickupUrl(pickupRef.id), data: { type: 'rescue_escalation', reason, pickupId: pickupRef.id },
      });
    }
    tx.update(stateRef, {
      status: reason === 'not_started' ? st.status : 'escalated',
      escalation: { reason, at: Timestamp.fromMillis(now), coordinator_uids: coordinators },
      next_action_at: null, updated_at: FieldValue.serverTimestamp(),
    });
    return { action: 'escalated', reason, coordinators };
  });
}

async function startReminder(db, pickupRef, s, { now }) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const pickup = (await pickupRef.get()).data();
  if (pickup?.status !== 'claimed' || pickup.claimed_by !== s.assigned_to) {
    return closeIf(db, stateRef, s.generation, (st) => st.status === 'assigned', now);
  }
  const pickupBy = ms(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until);
  if (!(now >= pickupBy - START_REMINDER_BEFORE_MS)) return { action: 'none' };
  const reminded = await db.runTransaction(async (tx) => {
    const st = (await tx.get(stateRef)).data();
    if (!st || st.status !== 'assigned' || st.assigned_to !== pickup.claimed_by || st.start_reminder_at) return false;
    writeNotice(tx, db, `rescue_start_${safeId(pickupRef.id)}_${safeId(s.generation)}_${safeId(pickup.claimed_by)}`, {
      uid: pickup.claimed_by, kind: 'pickup', title: 'Time to head out',
      body: 'Your rescue’s pickup cutoff is close. Start the run, or release it so someone else can go.',
      url: pickupUrl(pickupRef.id), data: { type: 'rescue_start_reminder', pickupId: pickupRef.id },
    });
    tx.update(stateRef, { start_reminder_at: Timestamp.fromMillis(now), updated_at: FieldValue.serverTimestamp() });
    return true;
  });
  if (!reminded) return { action: 'none' };
  await escalate(db, pickupRef, s.generation, 'not_started', { now });
  return { action: 'reminded' };
}

// ── Scheduler: everything due now ───────────────────────────────────
async function advanceDue(db, { now = Date.now(), routing = routingProvider(), limit = 50 } = {}) {
  const due = await db.collectionGroup('dispatch')
    .where('next_action_at', '<=', Timestamp.fromMillis(now)).limit(limit).get();
  const results = [];
  for (const doc of due.docs) {
    if (doc.id !== 'state') continue;
    try {
      results.push({ pickupId: doc.ref.parent.parent.id, ...(await advance(db, doc.ref.parent.parent, { now, routing })) });
    } catch (error) {
      // One bad pickup must not block the rest; the next run retries it.
      console.error('rescue dispatch advance failed', doc.ref.parent.parent.id, error);
      results.push({ pickupId: doc.ref.parent.parent.id, action: 'error' });
    }
  }
  return results;
}

module.exports = {
  ROUNDS, ESCALATE_BEFORE_MS, START_REMINDER_BEFORE_MS, AVAILABILITY_MS, OFFER_TTL_MS, OFFER_MIN_MS, reservationUsable, closeOffersForVolunteer,
  offerDeadline, offerIsOpen, currentGeneration, wantsAlert,
  onPickupChange, advance, advanceDue, closeOffers, openOffers, writeNotice, safeId, pickupUrl,
};
