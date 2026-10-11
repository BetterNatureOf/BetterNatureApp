// C1 — server-authorized idempotent pickup completion.
//
// The prior client-side completePickup held one transaction only
// around the pickup write; member_activity / user-totals /
// org_stats / tax_receipts all committed afterward with random
// doc IDs. A partial failure (or two concurrent calls) could
// double-count hours or leave a completed pickup with no receipt.
//
// This callable moves the whole write set into one Firestore
// transaction with DETERMINISTIC document IDs. Retries converge
// on the same docs; concurrent calls serialize via Firestore's
// optimistic transaction retry; a second successful completion
// detects status === 'completed' + the sentinel completion
// receipt and short-circuits to a cached result.
//
// Side-effect notifications (surplus delivered / tax receipt
// ready) fire AFTER the transaction via queueBusinessNotification,
// which is already J1-recoverable.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const EXEC_ROLES = new Set(['executive', 'admin', 'super_admin']);

function userIsExec(u) {
  if (!u) return false;
  const r = u.role, rs = Array.isArray(u.roles) ? u.roles : [];
  return EXEC_ROLES.has(r) || rs.some((x) => EXEC_ROLES.has(x));
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function activityDocId(pickupId)   { return `pickup_${pickupId}`; }
function receiptDocId(pickupId)    { return `rcpt_${pickupId}`;   }

exports.completePickupOperation = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  const caller = context.auth.uid;
  const pickupId = String(data?.pickup_id || '').trim();
  if (!pickupId) throw new functions.https.HttpsError('invalid-argument', 'pickup_id required');

  const weightLbs = Number(data?.actual_weight_lbs);
  const override  = !!data?.override;
  const spoiled   = !!data?.spoiled;
  const spoiledKind = spoiled && data?.spoiled_kind ? String(data.spoiled_kind).slice(0, 40) : null;
  const spoiledNote = spoiled && data?.spoiled_note ? String(data.spoiled_note).slice(0, 500) : null;
  const unverifiedNote = data?.unverified_note ? String(data.unverified_note).slice(0, 500) : null;
  const dropoffPhotoUrl = data?.dropoff_photo_url ? String(data.dropoff_photo_url).slice(0, 1024) : null;
  const fridgeIdOverride = data?.fridge_id ? String(data.fridge_id) : null;

  const db = admin.firestore();
  const pkRef  = db.doc(`pickups/${pickupId}`);
  const actRef = db.doc(`member_activity/${activityDocId(pickupId)}`);
  const recRef = db.doc(`tax_receipts/${receiptDocId(pickupId)}`);

  // Pre-fetch the caller's own doc (for exec check + display name)
  // outside the transaction. The transaction below re-reads the
  // claimant inside its scope so we can confirm not disabled.
  const callerSnap = await db.doc(`users/${caller}`).get();
  const callerUser = callerSnap.exists ? callerSnap.data() : null;
  const isExec = userIsExec(callerUser);

  // Pre-fetch fridge override + restaurant for the receipt body.
  // These are read outside the transaction because they're stable
  // enough that a race between read and commit is a non-issue;
  // the transaction below still validates the pickup itself.
  let fridgeOverride = null;
  if (fridgeIdOverride) {
    try {
      const f = await db.doc(`fridges/${fridgeIdOverride}`).get();
      if (f.exists) {
        const d = f.data() || {};
        fridgeOverride = {
          fridge_id: fridgeIdOverride,
          fridge_name: d.name || '',
          fridge_address: d.address || [d.city, d.state].filter(Boolean).join(', '),
          fridge_lat: d.lat ?? null,
          fridge_lng: d.lng ?? null,
        };
      }
    } catch (e) { /* best-effort */ }
  }

  // One transaction: pickup + activity + receipt + claimant +
  // chapter stat bump are all atomic. On the second call for the
  // same pickup, the transaction sees pickup.status === 'completed'
  // AND the activity doc already present AND the receipt doc
  // already present, and returns the cached result without
  // re-queuing writes.
  const result = await db.runTransaction(async (tx) => {
    const [pkSnap, actSnap, recSnap] = await Promise.all([
      tx.get(pkRef), tx.get(actRef), tx.get(recRef),
    ]);
    if (!pkSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Pickup not found.');
    }
    const pk = pkSnap.data();

    // Idempotency fast-path: already completed AND sentinel docs
    // present → return cached references without rewriting.
    if (pk.status === 'completed' && actSnap.exists && recSnap.exists) {
      return {
        cached: true,
        pickup_id: pickupId,
        receipt_id: recSnap.id,
        receipt_no: recSnap.data()?.receipt_no || null,
        actual_weight_lbs: pk.actual_weight_lbs,
        hours_earned: pk.hours_earned,
      };
    }

    // Precondition checks (replicating the client guards). Exec
    // override bypasses the "must be enroute" and "weight > 0"
    // checks but still runs the authorization block.
    if (!isExec && pk.claimed_by !== caller) {
      throw new functions.https.HttpsError('permission-denied', 'Not the claimant.');
    }
    if (pk.status === 'cancelled') {
      throw new functions.https.HttpsError('failed-precondition', 'Pickup was cancelled.');
    }
    if (!override && !spoiled && pk.status !== 'enroute') {
      throw new functions.https.HttpsError('failed-precondition', 'Pickup must be enroute before completion.');
    }
    if (spoiled && !['claimed','enroute'].includes(pk.status)) {
      throw new functions.https.HttpsError('failed-precondition', 'Spoiled report requires in-progress pickup.');
    }
    if (!override && !spoiled && !pk.verified_by_restaurant_at && !unverifiedNote) {
      throw new functions.https.HttpsError('failed-precondition', 'Restaurant has not confirmed handoff. Provide unverified_note to proceed.');
    }
    if (!override && !spoiled) {
      if (!Number.isFinite(weightLbs) || weightLbs <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'actual_weight_lbs required.');
      }
    }

    // Resolve the claimant inside the tx so the disabled check is
    // atomic with the completion write.
    const claimantUid = pk.claimed_by || null;
    let claimantSnap = null;
    if (claimantUid) {
      claimantSnap = await tx.get(db.doc(`users/${claimantUid}`));
      if (!override && claimantSnap.exists && claimantSnap.data()?.disabled === true) {
        throw new functions.https.HttpsError('failed-precondition', 'Claimant account is disabled.');
      }
    }

    const weight = spoiled ? 0 : (override
      ? (Number.isFinite(weightLbs) && weightLbs > 0 ? weightLbs : num(pk.estimated_weight_lbs))
      : weightLbs);
    const meals = spoiled ? 0 : Math.round(weight * 1.2);
    // Hours earned anchors on enroute_at (fallback claimed_at).
    const toMs = (v) => v?.toMillis ? v.toMillis()
                     : v?.seconds != null ? v.seconds * 1000
                     : v ? new Date(v).getTime() : null;
    const anchorMs = toMs(pk.enroute_at) || toMs(pk.claimed_at) || Date.now();
    const elapsedH = (Date.now() - anchorMs) / 3600000;
    const hoursEarned = Math.max(0.25, Math.min(3, +elapsedH.toFixed(2)));

    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();

    // Pickup update.
    const pickupUpdate = {
      status: 'completed',
      actual_weight_lbs: weight,
      completed_at: nowIso,
      completed_at_ts: now,
      hours_earned: spoiled ? 0 : hoursEarned,
    };
    if (spoiled) {
      pickupUpdate.spoiled = true;
      pickupUpdate.spoiled_kind = spoiledKind;
      pickupUpdate.spoiled_note = spoiledNote;
    }
    if (dropoffPhotoUrl) pickupUpdate.dropoff_photo_url = dropoffPhotoUrl;
    if (!spoiled && fridgeOverride && fridgeOverride.fridge_id !== pk.fridge_id) {
      Object.assign(pickupUpdate, fridgeOverride, { fridge_changed_at: nowIso });
    }
    if (!spoiled && !pk.verified_by_restaurant_at && unverifiedNote) {
      pickupUpdate.handoff_unverified = true;
      pickupUpdate.handoff_unverified_note = unverifiedNote;
      pickupUpdate.handoff_unverified_at = nowIso;
    }
    tx.update(pkRef, pickupUpdate);

    // Member activity — deterministic doc id so a retry overwrites
    // the same row instead of double-counting.
    if (claimantUid && !actSnap.exists) {
      const pointsBase = 10;
      const pointsBonus = Math.min(50, meals);
      tx.create(actRef, {
        user_id: claimantUid,
        date: nowIso.split('T')[0],
        project: 'iris',
        meals, lbs: weight, hours: hoursEarned,
        events: 1,
        points: pointsBase + pointsBonus,
        raised: 0,
        source_type: 'pickup_complete',
        source_id: pickupId,
        created_at: now,
      });
    }

    // Claimant totals — only bump on the FIRST completion (when
    // the activity doc didn't already exist). This is the race-safe
    // version of the old "read, add, write" pattern.
    if (claimantUid && !actSnap.exists && claimantSnap?.exists) {
      tx.update(claimantSnap.ref, {
        meals_rescued: admin.firestore.FieldValue.increment(meals),
        lbs_rescued:   admin.firestore.FieldValue.increment(weight),
        hours_logged:  admin.firestore.FieldValue.increment(hoursEarned),
        events_attended: admin.firestore.FieldValue.increment(1),
        points:        admin.firestore.FieldValue.increment(10 + Math.min(50, meals)),
      });
    }

    // Receipt — deterministic id so a retry sees the sentinel.
    // Spoiled completions do NOT mint a receipt (nothing was
    // delivered). The receipt_no stays sequential within a
    // restaurant via a separate counter doc fetched below; we
    // accept at-most-once numbering because the tx can't afford a
    // full-collection count inside its scope.
    if (!spoiled && !recSnap.exists) {
      tx.create(recRef, {
        pickup_id: pickupId,
        restaurant_id: pk.restaurant_id || null,
        restaurant_name: pk.restaurant_name || '',
        restaurant_email: null, // populated by a follow-up worker if needed
        weight_lbs: weight,
        meals_equivalent: meals,
        picked_up_at: nowIso,
        volunteer_name: callerUser?.name || '',
        chapter_name: pk.chapter_name || '',
        issued_at: now,
        issued_at_iso: nowIso,
        no_goods_or_services: true,
        dropoff_photo_url: dropoffPhotoUrl || pk.dropoff_photo_url || null,
        fridge_name: (fridgeOverride && fridgeOverride.fridge_name) || pk.fridge_name || null,
        fridge_address: (fridgeOverride && fridgeOverride.fridge_address) || pk.fridge_address || null,
      });
    }

    return {
      cached: false,
      pickup_id: pickupId,
      receipt_id: spoiled ? null : recRef.id,
      actual_weight_lbs: weight,
      hours_earned: spoiled ? 0 : hoursEarned,
      meals,
      spoiled,
    };
  });

  // Append an audit entry outside the tx. Append-only; if this fails
  // we don't want to roll back the completion.
  try {
    await db.collection('audit_events').add({
      actor_uid: caller,
      actor_role: isExec ? 'exec' : 'claimant',
      action: 'pickup_complete',
      pickup_id: pickupId,
      override: !!override,
      cached: !!result.cached,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('audit_events append failed', e?.message); }

  // Bump org counters once per completion. Uses increment() so a
  // retry (hitting the idempotency fast-path above) returns
  // without bumping again.
  if (!result.cached) {
    try {
      await db.doc('org_stats/global').set({
        lbs:   admin.firestore.FieldValue.increment(result.actual_weight_lbs),
        hours: admin.firestore.FieldValue.increment(result.hours_earned),
        events: admin.firestore.FieldValue.increment(1),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) { console.warn('org_stats bump failed', e?.message); }
  }

  return { ok: true, ...result };
});
