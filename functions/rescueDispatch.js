// Rescue dispatch: bounded nearby alert rounds, expansion when nobody
// accepts, recovery after a release, and coordinator escalation before
// the deadline.
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
const { pickupRoadTimes } = require('./dispatchRouting');

const MINUTE = 60_000;
const RESOLUTION = 7;                 // ~1.2 km hex edge
const ROUNDS = [                      // k = grid-disk radius in res-7 cells
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

// An offer volunteers can still accept.
function offerIsOpen(p, now) {
  return p?.status === 'available' && !!p.chapter_id && !p.claimed_by && !!p.destination_confirmation &&
    !p.safety_hold && !p.verified_by_restaurant_at && !p.handoff_from_uid && offerDeadline(p) > now;
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
async function onPickupChange(db, pickupRef, after, { now = Date.now(), roadTimes = pickupRoadTimes } = {}) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
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
    if (started) return advance(db, pickupRef, { now, roadTimes });
    return { action: 'none' };
  }
  // Claimed: watch for a volunteer who hasn't left before the cutoff.
  return db.runTransaction(async (tx) => {
    const state = await tx.get(stateRef);
    if (!state.exists) return { action: 'none' };
    const s = state.data();
    const pickup = (await tx.get(pickupRef)).data();
    if (pickup?.status === 'claimed' && pickup.claimed_by) {
      if (s.status === 'assigned' && s.assigned_to === pickup.claimed_by) return { action: 'none' };
      const pickupBy = ms(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until);
      tx.update(stateRef, { status: 'assigned', assigned_to: pickup.claimed_by, start_reminder_at: null,
        next_action_at: Number.isFinite(pickupBy) ? Timestamp.fromMillis(pickupBy - START_REMINDER_BEFORE_MS) : null,
        updated_at: FieldValue.serverTimestamp() });
      return { action: 'assigned' };
    }
    if (['searching', 'assigned', 'escalated'].includes(s.status) && !offerIsOpen(pickup, now)) {
      tx.update(stateRef, { status: pickup?.status === 'enroute' ? 'in_progress' : 'closed',
        next_action_at: null, updated_at: FieldValue.serverTimestamp() });
      return { action: 'closed' };
    }
    return { action: 'none' };
  });
}

// ── Scheduler step for one pickup ───────────────────────────────────
async function advance(db, pickupRef, { now = Date.now(), roadTimes = pickupRoadTimes } = {}) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const [stateSnap, pickupSnap] = await Promise.all([stateRef.get(), pickupRef.get()]);
  if (!stateSnap.exists || !pickupSnap.exists) return { action: 'none' };
  const s = stateSnap.data(), p = pickupSnap.data();

  if (s.status === 'assigned') return startReminder(db, pickupRef, s, { now });
  if (s.status !== 'searching') return { action: 'none' };
  const gen = currentGeneration(p);
  if (!offerIsOpen(p, now) || !gen || gen.key !== s.generation) {
    return closeIf(db, stateRef, s.generation, (state) => state.status === 'searching', now);
  }
  const deadline = offerDeadline(p);
  if (deadline - now <= ESCALATE_BEFORE_MS) return escalate(db, pickupRef, s.generation, 'deadline_approaching', { now });
  if (s.round >= ROUNDS.length) return escalate(db, pickupRef, s.generation, 'no_acceptance', { now });
  if (deadline - now <= MIN_ALERT_LEAD_MS) return escalate(db, pickupRef, s.generation, 'deadline_approaching', { now });
  return runRound(db, pickupRef, s, p, { now, roadTimes });
}

async function closeIf(db, stateRef, generation, predicate, now) {
  return db.runTransaction(async (tx) => {
    const st = await tx.get(stateRef);
    if (!st.exists || st.data().generation !== generation || !predicate(st.data())) return { action: 'none' };
    tx.update(stateRef, { status: 'closed', next_action_at: null, updated_at: FieldValue.serverTimestamp() });
    return { action: 'closed' };
  });
}

async function runRound(db, pickupRef, s, p, { now, roadTimes }) {
  const roundNo = s.round + 1;
  const { k, limit } = ROUNDS[roundNo - 1];
  const lat = p.restaurant_lat, lng = p.restaurant_lng;
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const located = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  // Network and wide reads stay outside the transaction (retries re-run it).
  let cells = [], candidates = [], times = new Map();
  if (located) {
    cells = gridDisk(latLngToCell(lat, lng, RESOLUTION), k);
    // Bound the work per round; the nearest rings come first.
    candidates = (await availabilityNear(db, cells)).slice(0, MAX_CANDIDATES);
    if (candidates.length) times = await roadTimes(cells, [lat, lng]);
  }

  return db.runTransaction(async (tx) => {
    const [stSnap, pkSnap] = await Promise.all([tx.get(stateRef), tx.get(pickupRef)]);
    const st = stSnap.data(), current = pkSnap.data();
    // Another runner already took this round, or the offer changed.
    if (!st || st.status !== 'searching' || st.generation !== s.generation || st.round !== s.round) {
      return { action: 'skipped' };
    }
    const gen = currentGeneration(current);
    if (!offerIsOpen(current, now) || !gen || gen.key !== st.generation) return { action: 'skipped' };

    const ring = new Set(cells);
    const ranked = [];
    for (const c of candidates) {
      const fresh = (await tx.get(c.ref)).data();
      const updated = ms(fresh?.updated_at);
      if (!fresh || !ring.has(fresh.cell) || !(updated <= now && updated > now - AVAILABILITY_MS)) continue;
      ranked.push({ uid: c.id, seconds: times.get(fresh.cell),
        km: greatCircleDistance([lat, lng], cellToLatLng(fresh.cell), 'km') });
    }
    // One metric for the whole shortlist: road time only when every
    // candidate has an estimate; otherwise straight-line distance.
    const roadTime = ranked.length > 0 && ranked.every((r) => r.seconds !== undefined);
    ranked.sort((a, b) => (roadTime ? a.seconds - b.seconds : 0) || a.km - b.km || a.uid.localeCompare(b.uid));

    const excluded = new Set([...(st.excluded_uids || []), current.receiver_uid, current.restaurant_user_id,
      current.restaurant_id, current.released_by, current.abandoned_prior_claimant].filter(Boolean));
    const genId = safeId(st.generation);
    const recipients = [];
    const skipped = { excluded: 0, already_alerted: 0, ineligible: 0, busy: 0 };
    for (const { uid } of ranked) {
      if (recipients.length === limit) break;
      if (excluded.has(uid)) { skipped.excluded++; continue; }
      const alertRef = pickupRef.collection('dispatch_alerts').doc(`${genId}_${safeId(uid)}`);
      if ((await tx.get(alertRef)).exists) { skipped.already_alerted++; continue; }
      const user = (await tx.get(db.collection('users').doc(uid))).data();
      if (!wantsAlert(user, current)) { skipped.ineligible++; continue; }
      const busy = await tx.get(db.collection('pickups').where('claimed_by', '==', uid)
        .where('status', 'in', ['claimed', 'enroute']).limit(1));
      if (!busy.empty) { skipped.busy++; continue; }
      recipients.push({ uid, user, alertRef });
    }

    for (const { uid, user, alertRef } of recipients) {
      tx.create(alertRef, { uid, generation: st.generation, round: roundNo, at: FieldValue.serverTimestamp() });
      writeNotice(tx, db, `rescue_${safeId(pickupRef.id)}_${genId}_${safeId(uid)}`, {
        uid, kind: ALERT_KIND, title: 'Nearby food rescue',
        body: 'Open Better Nature to review the route, timing, and whether the pickup is still available.',
        url: pickupUrl(pickupRef.id), data: { type: 'pickup_available', pickupId: pickupRef.id },
        push: user.push_enabled === true && !!user.onesignal_player_id,
      });
    }
    const deadline = offerDeadline(current);
    const roundsLeft = ROUNDS.length - roundNo;
    const gap = recipients.length ? roundGap(deadline, now, roundsLeft + 1) : EMPTY_ROUND_GAP_MS;
    tx.update(stateRef, {
      round: roundNo, alerted_count: (st.alerted_count || 0) + recipients.length,
      last_round: { round: roundNo, radius_cells: k, recipients: recipients.length,
        ranking: roadTime ? 'road_time' : ranked.length ? 'distance' : 'none',
        location: located ? 'known' : 'missing', skipped, at: Timestamp.fromMillis(now) },
      next_action_at: Timestamp.fromMillis(now + gap), updated_at: FieldValue.serverTimestamp(),
    });
    return { action: 'round', round: roundNo, recipients: recipients.map((r) => r.uid) };
  });
}

async function escalate(db, pickupRef, generation, reason, { now }) {
  const stateRef = pickupRef.collection('dispatch').doc('state');
  const pickup = (await pickupRef.get()).data();
  const coordinators = await coordinatorsFor(db, pickup?.chapter_id);
  return db.runTransaction(async (tx) => {
    const st = (await tx.get(stateRef)).data();
    if (!st || st.generation !== generation || st.escalation) return { action: 'none' };
    const body = reason === 'no_acceptance'
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
async function advanceDue(db, { now = Date.now(), roadTimes = pickupRoadTimes, limit = 50 } = {}) {
  const due = await db.collectionGroup('dispatch')
    .where('next_action_at', '<=', Timestamp.fromMillis(now)).limit(limit).get();
  const results = [];
  for (const doc of due.docs) {
    if (doc.id !== 'state') continue;
    try {
      results.push({ pickupId: doc.ref.parent.parent.id, ...(await advance(db, doc.ref.parent.parent, { now, roadTimes })) });
    } catch (error) {
      // One bad pickup must not block the rest; the next run retries it.
      console.error('rescue dispatch advance failed', doc.ref.parent.parent.id, error);
      results.push({ pickupId: doc.ref.parent.parent.id, action: 'error' });
    }
  }
  return results;
}

module.exports = {
  ROUNDS, ESCALATE_BEFORE_MS, START_REMINDER_BEFORE_MS, AVAILABILITY_MS,
  offerDeadline, offerIsOpen, currentGeneration, wantsAlert,
  onPickupChange, advance, advanceDue,
};
