// Receiving sites: hours, pause, food types, daily capacity with
// reservations, partial acceptance and remainder disposition.
//
// receiving_sites/{siteId}
//   name, type: staffed_center | steward_fridge | outreach_partner,
//   chapter_id, address, lat, lng, timezone (IANA, default America/Chicago),
//   hours: { mon: [{ open: '09:00', close: '17:00' }], ... }  (absent = unknown)
//   status: active | paused, paused_until, pause_reason,
//   food_categories: [...] (absent = accepts anything, flagged unknown),
//   capacity: { packages_per_day, weight_lbs_per_day }  (null = no limit set),
//   receiver_uid (staff member or fridge steward who confirms receipts),
//   contacts: [{ name, phone, role }]
// receiving_sites/{siteId}/reservations/{pickupId}
//   day (site-local YYYY-MM-DD), packages, weight_lbs,
//   status: held | released | expired | overdue | received,
//   expires_at (arrival_by + 30 min), collected (donor confirmed collection)
//
// Capacity accounting: held, overdue and received reservations count.
// A hold that passes expires_at before collection stops counting and is
// marked expired. A hold whose food was already collected never silently
// frees capacity: it becomes `overdue` (still counted) until a receipt,
// reroute or coordinator closure resolves it.
//
// Confirmation against a saved site runs here so capacity is checked and
// reserved atomically. A trigger settles reservations on every path
// (cancel, expiry, reroute, receipt), including client-side ones.
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v1/https');
const { rescueCargo } = require('./lib/rescueCargo');
const { POLICY } = require('./lib/rescuePolicy');
const GRACE_MS = POLICY.RESERVATION_GRACE_MIN * 60_000;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SITE_TYPES = ['staffed_center', 'steward_fridge', 'outreach_partner'];
const REMAINDER_OUTCOMES = ['delivered_elsewhere', 'returned_to_donor', 'discarded', 'composted'];
const REASON_TEXT = {
  site_invalid: 'the site record is incomplete',
  other_chapter: 'it belongs to another chapter',
  site_paused: 'it is paused right now',
  closed_at_arrival: 'it is closed at the receiving deadline',
  food_type_not_accepted: 'it does not accept this type of food',
  closed_on_date: 'it is closed that day',
  no_cold_storage: 'it has no refrigerated storage for this food',
  no_hot_holding: 'it can’t hold hot food',
  over_package_capacity: 'it has no room for this many items today',
  over_weight_capacity: 'it has no room for this much weight today',
};
const ms = (v) => (v?.toMillis ? v.toMillis() : typeof v === 'string' ? Date.parse(v) : Number.isFinite(v) ? v : NaN);
const rolesOf = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];

function canCoordinate(user, chapterId) {
  if (!user || user.disabled) return false;
  const roles = rolesOf(user);
  if (roles.some((r) => ['executive', 'admin', 'super_admin'].includes(r))) return true;
  return !!chapterId && user.chapter_id === chapterId &&
    roles.some((r) => ['chapter_president', 'chapter_pres', 'chapter_vol_coord'].includes(r));
}

// Site-local day and minutes-since-midnight for an instant.
function localParts(atMs, timeZone = 'America/Chicago') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(atMs)).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday.toLowerCase().slice(0, 3), day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

// true / false, or null when the site has no hours on file.
function isOpenAt(site, atMs) {
  if (!site?.hours || typeof site.hours !== 'object') return null;
  const { weekday, minutes } = localParts(atMs, site.timezone);
  const slots = Array.isArray(site.hours[weekday]) ? site.hours[weekday] : [];
  return slots.some((s) => minutes >= toMin(s.open) && minutes < toMin(s.close));
}

function isPaused(site, now) {
  return site?.status === 'paused' && !(ms(site.paused_until) <= now);
}

// Can this site take this rescue arriving by arrivalBy? Reasons are
// blocking; warnings are unknowns the coordinator should know about.
function siteFit(site, pickup, { arrivalBy, now, used = { packages: 0, weight: 0 } }) {
  const reasons = [], warnings = [];
  if (!site || !SITE_TYPES.includes(site.type)) reasons.push('site_invalid');
  if (site && site.chapter_id !== pickup.chapter_id) reasons.push('other_chapter');
  if (isPaused(site, now)) reasons.push('site_paused');
  // Date-specific closures (holidays, one-off closed days), site-local date.
  if (Array.isArray(site?.closures) && site.closures.some((c) => c?.date === localParts(arrivalBy, site.timezone).day)) {
    reasons.push('closed_on_date');
  }
  const open = isOpenAt(site, arrivalBy);
  if (open === false) reasons.push('closed_at_arrival');
  if (open === null) warnings.push('hours_unknown');
  const cargo = rescueCargo(pickup);
  if (Array.isArray(site?.food_categories) && site.food_categories.length) {
    if (!cargo.foodCategory) warnings.push('food_category_unknown');
    else if (!site.food_categories.includes(cargo.foodCategory)) reasons.push('food_type_not_accepted');
  } else warnings.push('accepted_food_unknown');
  // Storage: cold food needs refrigeration; hot food needs hot holding
  // (or refrigeration to cool it). Unknown storage is a warning.
  const COLD = ['prepared_cold', 'dairy', 'meat', 'mixed'];
  if (Array.isArray(site?.storage) && site.storage.length && cargo.foodCategory) {
    if (COLD.includes(cargo.foodCategory) && !site.storage.includes('refrigerated') && !site.storage.includes('frozen')) reasons.push('no_cold_storage');
    if (cargo.foodCategory === 'prepared_hot' && !site.storage.includes('hot_holding') && !site.storage.includes('refrigerated')) reasons.push('no_hot_holding');
  } else if (cargo.foodCategory) warnings.push('storage_unknown');
  const cap = site?.capacity || {};
  if (Number.isFinite(cap.packages_per_day)) {
    if (cargo.packages == null) warnings.push('packages_unknown');
    else if (used.packages + cargo.packages > cap.packages_per_day) reasons.push('over_package_capacity');
  }
  if (Number.isFinite(cap.weight_lbs_per_day)) {
    if (cargo.weight == null) warnings.push('weight_unknown');
    else if (used.weight + cargo.weight > cap.weight_lbs_per_day) reasons.push('over_weight_capacity');
  }
  return { ok: reasons.length === 0, reasons, warnings };
}

async function usedOnDay(tx, siteRef, day, excludePickupId, now = Date.now()) {
  const snap = await tx.get(siteRef.collection('reservations').where('day', '==', day));
  let packages = 0, weight = 0;
  snap.docs.forEach((d) => {
    const r = d.data();
    if (d.id === excludePickupId || !['held', 'overdue', 'received'].includes(r.status)) return;
    // An uncollected hold past its expiry no longer counts; collected food does.
    if (r.status === 'held' && !r.collected && Number.isFinite(ms(r.expires_at)) && ms(r.expires_at) <= now) return;
    packages += r.status === 'received' ? (r.accepted_packages ?? r.packages ?? 0) : (r.packages || 0);
    weight += r.status === 'received' ? (r.accepted_weight_lbs ?? r.weight_lbs ?? 0) : (r.weight_lbs || 0);
  });
  return { packages, weight };
}

// ── Callable: confirm a rescue's destination against a saved site ──
// `authorize(caller, pickup, site)` decides who may confirm: chapter
// coordinators by default; a site's own receiver when accepting a
// donor's partner request (partnerRequests.js).
async function confirmDestination(db, data, uid, { now = Date.now(), authorize = null, extraUpdate = null } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  const siteId = typeof data?.siteId === 'string' ? data.siteId : '';
  const arrivalBy = Number(data?.arrivalBy);
  if (!pickupId || pickupId.includes('/') || !siteId || siteId.includes('/') || !Number.isFinite(arrivalBy)) {
    throw new HttpsError('invalid-argument', 'Choose a rescue, a receiving site and a receiving deadline.');
  }
  const pickupRef = db.doc(`pickups/${pickupId}`), siteRef = db.doc(`receiving_sites/${siteId}`);
  const callerRef = db.doc(`users/${uid}`);
  return db.runTransaction(async (tx) => {
    const [pkSnap, siteSnap, callerSnap] = await Promise.all([tx.get(pickupRef), tx.get(siteRef), tx.get(callerRef)]);
    const pickup = pkSnap.data(), site = siteSnap.data();
    if (!pickup) throw new HttpsError('not-found', 'Rescue not found.');
    const allowed = authorize ? authorize(callerSnap.data(), pickup, site, uid) : canCoordinate(callerSnap.data(), pickup.chapter_id);
    if (!allowed) {
      throw new HttpsError('permission-denied', 'Only this chapter’s coordinators or the site’s receiver can confirm a receiving site.');
    }
    if (pickup.destination_confirmation?.site_id === siteId && pickup.status === 'available') {
      return { ok: true, cached: true };
    }
    if (!['pending_destination', 'available'].includes(pickup.status) || pickup.destination_confirmation ||
        pickup.claimed_by || pickup.safety_hold || pickup.verified_by_restaurant_at) {
      throw new HttpsError('failed-precondition', 'This rescue already has a destination or is in progress.');
    }
    const pickupBy = ms(pickup.pickup_window_until);
    if (!(pickupBy > now) || !(arrivalBy > pickupBy)) {
      throw new HttpsError('failed-precondition', 'The receiving deadline must be after the donor’s pickup cutoff.', { reason: 'window' });
    }
    if (!site) throw new HttpsError('not-found', 'Receiving site not found.');
    const day = localParts(arrivalBy, site.timezone).day;
    const used = await usedOnDay(tx, siteRef, day, pickupId, now);
    const fit = siteFit(site, pickup, { arrivalBy, now, used });
    if (!fit.ok) {
      const why = fit.reasons.map((r) => REASON_TEXT[r] || r).join(', and ');
      throw new HttpsError('failed-precondition', `This site can’t take this rescue: ${why}.`, { reasons: fit.reasons });
    }
    const cargo = rescueCargo(pickup);
    const weight = Number(pickup.estimated_weight_lbs);
    tx.set(siteRef.collection('reservations').doc(pickupId), {
      pickup_id: pickupId, day, packages: cargo.packages, weight_lbs: cargo.weight, status: 'held',
      // Held until the receiving deadline (+30 min grace for a late run).
      expires_at: Timestamp.fromMillis(arrivalBy + GRACE_MS), collected: false,
      created_by: uid, created_at: FieldValue.serverTimestamp(),
    });
    const contact = site.contacts?.[0] ? `${site.contacts[0].name}${site.contacts[0].phone ? ` · ${site.contacts[0].phone}` : ''}` : site.name;
    tx.update(pickupRef, {
      status: 'available',
      fridge_id: null, fridge_name: site.name, fridge_address: site.address || '',
      fridge_lat: site.lat ?? null, fridge_lng: site.lng ?? null, fridge_h3: null,
      destination_confirmation: {
        site_name: site.name, address: site.address || '', contact, site_id: siteId,
        confirmed_by: uid, confirmed_at: FieldValue.serverTimestamp(), accepted_weight_lbs: weight,
        pickup_by: Timestamp.fromMillis(pickupBy), arrival_by: Timestamp.fromMillis(arrivalBy),
      },
      receiving_site: { id: siteId, type: site.type, food_categories: site.food_categories || null,
        opens_at: null, closes_at: null, remaining_packages: Number.isFinite(site.capacity?.packages_per_day)
          ? site.capacity.packages_per_day - used.packages - (cargo.packages || 0) : null },
      ...(extraUpdate ? extraUpdate(pickup, site) : {}),
      ...(site.receiver_uid && site.receiver_uid !== pickup.restaurant_id ? {
        receiver_uid: site.receiver_uid, receiver_assigned_by: uid, receiver_assigned_at: FieldValue.serverTimestamp(),
      } : {}),
    });
    return { ok: true, warnings: fit.warnings };
  });
}

// ── Callable: what happened to food the site didn't accept ──────────
async function recordRemainder(db, data, uid, { now = Date.now() } = {}) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  const outcome = data?.outcome;
  const note = typeof data?.note === 'string' ? data.note.trim().slice(0, 300) : '';
  const elsewhereSite = typeof data?.siteName === 'string' ? data.siteName.trim().slice(0, 200) : '';
  const elsewhereLbs = Number(data?.acceptedLbs);
  if (!pickupId || pickupId.includes('/') || !REMAINDER_OUTCOMES.includes(outcome)) {
    throw new HttpsError('invalid-argument', 'Choose what happened to the remaining food.');
  }
  const pickupRef = db.doc(`pickups/${pickupId}`);
  return db.runTransaction(async (tx) => {
    const [pkSnap, callerSnap] = await Promise.all([tx.get(pickupRef), tx.get(db.doc(`users/${uid}`))]);
    const pickup = pkSnap.data();
    if (!pickup) throw new HttpsError('not-found', 'Rescue not found.');
    if (!canCoordinate(callerSnap.data(), pickup.chapter_id)) {
      throw new HttpsError('permission-denied', 'Only this chapter’s coordinators can record a disposition.');
    }
    const rejected = Number(pickup.receiving_receipt?.rejected_weight_lbs);
    if (!(rejected > 0)) throw new HttpsError('failed-precondition', 'Nothing is waiting for a disposition.');
    if (pickup.remainder_disposition) {
      if (pickup.remainder_disposition.outcome === outcome) return { ok: true, cached: true };
      throw new HttpsError('failed-precondition', 'A disposition is already recorded.');
    }
    if (outcome === 'delivered_elsewhere' && (!elsewhereSite || !(elsewhereLbs > 0) || elsewhereLbs > rejected)) {
      throw new HttpsError('invalid-argument', 'Enter the other site and the pounds it accepted (up to the rejected amount).');
    }
    tx.update(pickupRef, {
      remainder_disposition: {
        outcome, note: note || null, weight_lbs: rejected,
        accepted_elsewhere_lbs: outcome === 'delivered_elsewhere' ? elsewhereLbs : 0,
        site_name: outcome === 'delivered_elsewhere' ? elsewhereSite : null,
        recorded_by: uid, recorded_at: Timestamp.fromMillis(now),
      },
    });
    tx.create(db.collection('audit_events').doc(`remainder_${pickupId}`), {
      action: 'rescue_remainder_disposition', pickup_id: pickupId, outcome, actor_uid: uid,
      weight_lbs: rejected, at: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  });
}

// Weight that completion must report: what the receiving site accepted,
// plus anything a second site accepted from the remainder.
function deliverableWeight(pickup) {
  const receipt = pickup?.receiving_receipt;
  if (!receipt) return null;
  const rejected = Number(receipt.rejected_weight_lbs) || 0;
  if (rejected > 0 && !pickup.remainder_disposition) return { pending: true };
  return { pending: false, weight: Number(receipt.weight_lbs) + (Number(pickup.remainder_disposition?.accepted_elsewhere_lbs) || 0),
    rejected: rejected - (Number(pickup.remainder_disposition?.accepted_elsewhere_lbs) || 0) };
}

// ── Trigger: keep reservations in step with the rescue ──────────────
async function reconcileReservation(db, pickupRef, before, after) {
  const prevSite = before?.destination_confirmation?.site_id || null;
  const nextSite = after?.destination_confirmation?.site_id || null;
  const ops = [];
  const resRef = (siteId) => db.doc(`receiving_sites/${siteId}/reservations/${pickupRef.id}`);
  if (prevSite && prevSite !== nextSite) ops.push([resRef(prevSite), { status: 'released', released_reason: 'destination_changed' }]);
  if (nextSite && after.status === 'cancelled') ops.push([resRef(nextSite), { status: 'released', released_reason: 'cancelled' }]);
  if (nextSite && after.verified_by_restaurant_at && !before?.verified_by_restaurant_at) {
    ops.push([resRef(nextSite), { collected: true }]);
  }
  if (nextSite && after.receiving_receipt && !before?.receiving_receipt) {
    ops.push([resRef(nextSite), { status: 'received', accepted_weight_lbs: Number(after.receiving_receipt.weight_lbs) || 0,
      rejected_weight_lbs: Number(after.receiving_receipt.rejected_weight_lbs) || 0 }]);
  }
  for (const [ref, change] of ops) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const cur = snap.data();
      if (change.collected) { if (!cur.collected && ['held', 'overdue'].includes(cur.status)) tx.update(ref, { collected: true, updated_at: FieldValue.serverTimestamp() }); return; }
      if (cur.status === change.status) return;
      if (cur.status === 'received' && change.status === 'released') return;
      tx.update(ref, { ...change, updated_at: FieldValue.serverTimestamp() });
    });
  }
  return ops.length;
}

// ── State-based reconcile (no before/after needed) ──────────────────
// Used by the free rescue engine, which notices changes by polling. Looks
// at every reservation held for this pickup and settles each against the
// pickup's current state. Every change is guarded, so reruns are no-ops.
async function reconcileReservationState(db, pickupRef, after) {
  const site = after?.destination_confirmation?.site_id || null;
  const snap = await db.collectionGroup('reservations').where('pickup_id', '==', pickupRef.id).get();
  let changed = 0;
  for (const d of snap.docs) {
    const resSite = d.ref.parent.parent.id;
    const change = resSite !== site ? { status: 'released', released_reason: 'destination_changed' }
      : after?.status === 'cancelled' ? { status: 'released', released_reason: 'cancelled' }
        : after?.receiving_receipt ? { status: 'received', accepted_weight_lbs: Number(after.receiving_receipt.weight_lbs) || 0,
          rejected_weight_lbs: Number(after.receiving_receipt.rejected_weight_lbs) || 0 }
          : after?.verified_by_restaurant_at ? { collected: true } : null;
    if (!change) continue;
    const done = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(d.ref)).data();
      if (!cur) return false;
      if (change.collected) {
        if (cur.collected || !['held', 'overdue'].includes(cur.status)) return false;
        tx.update(d.ref, { collected: true, updated_at: FieldValue.serverTimestamp() });
        return true;
      }
      if (cur.status === change.status || (cur.status === 'received' && change.status === 'released')) return false;
      if (change.status === 'released' && ['released', 'expired'].includes(cur.status)) return false;
      tx.update(d.ref, { ...change, updated_at: FieldValue.serverTimestamp() });
      return true;
    });
    if (done) changed++;
  }
  return changed;
}

// ── Scheduler: holds past expires_at ─────────────────────────────────
// Uncollected → expired (capacity frees; dispatch stops offering it).
// Collected but not received → overdue (capacity stays held; the rescue
// queue shows the late delivery until someone resolves it).
async function sweepReservations(db, { now = Date.now(), limit = 100 } = {}) {
  const snap = await db.collectionGroup('reservations').where('status', '==', 'held')
    .where('expires_at', '<=', Timestamp.fromMillis(now)).limit(limit).get();
  const out = { expired: 0, overdue: 0 };
  for (const d of snap.docs) {
    const pickupRef = db.doc(`pickups/${d.id}`);
    const result = await db.runTransaction(async (tx) => {
      const [res, pk] = await Promise.all([tx.get(d.ref), tx.get(pickupRef)]);
      const r = res.data(), p = pk.data();
      if (r?.status !== 'held' || !(ms(r.expires_at) <= now)) return null;
      const collected = r.collected || !!p?.verified_by_restaurant_at;
      if (collected && !p?.receiving_receipt && p?.status !== 'cancelled') {
        tx.update(d.ref, { status: 'overdue', collected: true, overdue_at: Timestamp.fromMillis(now), updated_at: FieldValue.serverTimestamp() });
        return 'overdue';
      }
      tx.update(d.ref, { status: 'expired', released_reason: 'expired_before_collection', updated_at: FieldValue.serverTimestamp() });
      return 'expired';
    });
    if (result) out[result]++;
  }
  return out;
}

module.exports = { sweepReservations, reconcileReservationState,
  SITE_TYPES, REMAINDER_OUTCOMES, localParts, isOpenAt, isPaused, siteFit, canCoordinate,
  confirmDestination, recordRemainder, deliverableWeight, reconcileReservation,
};
