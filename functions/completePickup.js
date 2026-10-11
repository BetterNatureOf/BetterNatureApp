// C1 (R1–R7) — one coherent server-authorized completion state
// machine. Replaces the earlier draft that split responsibilities
// across the pickup write, member_activity, user totals, receipt,
// org_stats, and notification queue — each with its own idempotency
// story. The redesign uses a single immutable completion record at
// /pickup_completions/{pickupId} as the ONLY sentinel; everything
// else (pickup update, activity row, receipt doc, totals, org
// counters, notification intent) is derived from that record and
// committed inside the SAME Firestore transaction.
//
// Supported outcomes:
//   delivered     — ordinary claimant completion with weight > 0
//   spoiled       — in-progress pickup marked unusable (weight 0, no receipt)
//   exec_override — exec/admin completes a pickup, usually on behalf of
//                   a stalled claimant; override reason is required
//
// Idempotency: a replay reads the sentinel; if present AND the
// caller is authorized for THIS pickup, we return the frozen
// outcome (receipt id, actor, weight, hours) without rewriting
// anything. If the sentinel is absent, authorization + preconditions
// + the atomic write all run inside one transaction.
//
// Authorization rules:
//   - Exec roles (executive/admin/super_admin): may complete any
//     pickup, with or without override. override:true additionally
//     bypasses the enroute/handoff/weight gates and REQUIRES an
//     explicit override_reason that's recorded on the sentinel.
//   - Claimant: may complete the pickup they currently hold, under
//     the standard gates (status=enroute, handoff verified or
//     unverified_note provided, weight > 0, account not disabled).
//   - Anyone else: permission-denied even on a replay request.
//
// Notification intent: written to /notification_work/{dedupKey}
// inside the same transaction (reuses the A2 J1 recovery path).
// External delivery stays decoupled; the A2 sweep guarantees
// at-least-once delivery once this transaction commits.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const EXEC_ROLES = new Set(['executive', 'admin', 'super_admin']);
const ORG_INFO = {
  name: 'BetterNature',
  legalName: 'BetterNature Inc.',
  ein: '99-4028399',
  address: '',
  email: 'info@betternatureofficial.org',
  website: 'betternatureofficial.org',
};

function userIsExec(u) {
  if (!u) return false;
  const r = u.role, rs = Array.isArray(u.roles) ? u.roles : [];
  return EXEC_ROLES.has(r) || rs.some((x) => EXEC_ROLES.has(x));
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function pad(n, len = 4) { return String(n).padStart(len, '0'); }

function activityId(pickupId) { return `pickup_${pickupId}`; }
function receiptId(pickupId)  { return `rcpt_${pickupId}`; }
function completionId(pickupId) { return pickupId; }
function dedupKeyFor(pickupId) { return `pickup:to_partner:complete:${pickupId}`; }

exports.completePickupOperation = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  const caller = context.auth.uid;

  const pickupId = String(data?.pickup_id || '').trim();
  if (!pickupId) throw new functions.https.HttpsError('invalid-argument', 'pickup_id required');

  const weightLbs = Number(data?.actual_weight_lbs);
  const override  = !!data?.override;
  const overrideReason = override ? String(data?.override_reason || '').slice(0, 500) : null;
  const spoiled   = !!data?.spoiled;
  const spoiledKind = spoiled && data?.spoiled_kind ? String(data.spoiled_kind).slice(0, 40) : null;
  const spoiledNote = spoiled && data?.spoiled_note ? String(data.spoiled_note).slice(0, 500) : null;
  const unverifiedNote = data?.unverified_note ? String(data.unverified_note).slice(0, 500) : null;
  const dropoffPhotoUrl = data?.dropoff_photo_url ? String(data.dropoff_photo_url).slice(0, 1024) : null;
  const fridgeIdOverride = data?.fridge_id ? String(data.fridge_id) : null;

  const db = admin.firestore();
  const pkRef    = db.doc(`pickups/${pickupId}`);
  const compRef  = db.doc(`pickup_completions/${completionId(pickupId)}`);
  const actRef   = db.doc(`member_activity/${activityId(pickupId)}`);
  const recRef   = db.doc(`tax_receipts/${receiptId(pickupId)}`);
  const orgRef   = db.doc('org_stats/global');

  // Pre-fetch stable context outside the tx: the override fridge
  // metadata. Receipt counter + restaurant doc are read inside the
  // tx so numbering is tx-safe.
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

  const result = await db.runTransaction(async (tx) => {
    const [pkSnap, compSnap, callerSnap] = await Promise.all([
      tx.get(pkRef),
      tx.get(compRef),
      tx.get(db.doc(`users/${caller}`)),
    ]);
    if (!pkSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Pickup not found.');
    }
    const pk = pkSnap.data();
    const callerUser = callerSnap.exists ? callerSnap.data() : null;
    const callerIsExec = userIsExec(callerUser);

    // R2 — authorize BEFORE returning cached. On a replay for an
    // unrelated signed-in user, the caller must still be the
    // original claimant or an exec reviewing their own project.
    const originalClaimant = pk.claimed_by || null;
    const callerIsClaimant = originalClaimant && originalClaimant === caller;

    // Idempotency sentinel — a single doc that captures the outcome.
    if (compSnap.exists) {
      const comp = compSnap.data();
      // Authorize cached read: exec or the recorded claimant
      // (which equals the sentinel's claimant_uid), OR the exec
      // who originally completed via override.
      const originallyClaimant = comp.claimant_uid || originalClaimant || null;
      const originallyActor    = comp.actor_uid || null;
      if (!callerIsExec && caller !== originallyClaimant && caller !== originallyActor) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized to view this completion.');
      }
      return {
        cached: true,
        outcome: comp.outcome,
        pickup_id: pickupId,
        receipt_id: comp.receipt_id || null,
        actual_weight_lbs: comp.weight,
        hours_earned: comp.hours,
        meals: comp.meals,
        spoiled: comp.outcome === 'spoiled',
      };
    }

    // R1 — override is EXEC-ONLY. Reject override from any other
    // caller; the override_reason is also required so the audit
    // record on the sentinel has meaning.
    if (override && !callerIsExec) {
      throw new functions.https.HttpsError('permission-denied', 'override requires an executive role.');
    }
    if (override && !overrideReason) {
      throw new functions.https.HttpsError('invalid-argument', 'override requires override_reason.');
    }

    // Authorization for fresh completion:
    //  - Default (delivered/spoiled): caller must be the current claimant.
    //  - Exec: may complete any pickup, with or without override.
    if (!callerIsExec && !callerIsClaimant) {
      throw new functions.https.HttpsError('permission-denied', 'Only the claimant or an executive may complete.');
    }
    if (pk.status === 'cancelled') {
      throw new functions.https.HttpsError('failed-precondition', 'Pickup was cancelled.');
    }

    // Decide outcome.
    let outcome;
    if (override) outcome = 'exec_override';
    else if (spoiled) outcome = 'spoiled';
    else outcome = 'delivered';

    // Preconditions per outcome.
    if (outcome === 'spoiled') {
      if (!['claimed', 'enroute'].includes(pk.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'Spoiled report requires an in-progress pickup.');
      }
    } else if (outcome === 'delivered') {
      if (pk.status !== 'enroute') {
        throw new functions.https.HttpsError('failed-precondition', 'Pickup must be enroute before completion.');
      }
      if (!pk.verified_by_restaurant_at && !unverifiedNote) {
        throw new functions.https.HttpsError('failed-precondition', 'Restaurant has not confirmed handoff. Provide unverified_note to proceed.');
      }
      if (!Number.isFinite(weightLbs) || weightLbs <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'actual_weight_lbs required.');
      }
    } // exec_override skips all three (that's its purpose).

    // Resolve claimant inside tx so the disabled check is atomic
    // with the pickup write. The claimant_uid frozen on the
    // sentinel is the pickup's current claimed_by, NOT the caller
    // — an exec overriding on behalf of a stalled volunteer
    // correctly attributes the activity to that volunteer.
    const claimantUid = originalClaimant;
    let claimantSnap = null;
    if (claimantUid) {
      claimantSnap = await tx.get(db.doc(`users/${claimantUid}`));
      if (outcome === 'delivered' && claimantSnap.exists && claimantSnap.data()?.disabled === true) {
        throw new functions.https.HttpsError('failed-precondition', 'Claimant account is disabled.');
      }
    }

    // Compute deltas per outcome.
    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();
    const toMs = (v) => v?.toMillis ? v.toMillis()
                     : v?.seconds != null ? v.seconds * 1000
                     : v ? new Date(v).getTime() : null;

    let weight = 0, meals = 0, hours = 0, points = 0;
    if (outcome === 'delivered') {
      weight = weightLbs;
      meals = Math.round(weight * 1.2);
      const anchorMs = toMs(pk.enroute_at) || toMs(pk.claimed_at) || Date.now();
      const elapsedH = (Date.now() - anchorMs) / 3600000;
      hours = Math.max(0.25, Math.min(3, +elapsedH.toFixed(2)));
      points = 10 + Math.min(50, meals);
    } else if (outcome === 'exec_override') {
      // Exec override: use provided weight if valid, else estimated.
      weight = Number.isFinite(weightLbs) && weightLbs > 0 ? weightLbs : num(pk.estimated_weight_lbs);
      meals = Math.round(weight * 1.2);
      hours = 0.25; // credit the stalled claimant with a minimum.
      points = 10;
    }
    // spoiled: all deltas stay 0 (R3 — zero means zero everywhere).

    // Receipt numbering — delivered OR exec_override (with weight).
    // The counter doc lives at /receipt_counters/{restaurant_id}
    // and increments inside this transaction so two concurrent
    // completions get distinct, sequential numbers. Spoiled
    // outcomes still have no receipt — nothing was delivered.
    let receiptNo = null;
    let receiptPath = null;
    const mintsReceipt =
         (outcome === 'delivered')
      || (outcome === 'exec_override' && weight > 0);
    if (mintsReceipt && pk.restaurant_id) {
      const counterRef = db.doc(`receipt_counters/${pk.restaurant_id}`);
      const counterSnap = await tx.get(counterRef);
      const next = (counterSnap.exists ? num(counterSnap.data()?.last_no) : 0) + 1;
      receiptNo = pad(next);
      tx.set(counterRef, { last_no: next, updated_at: now }, { merge: true });
      receiptPath = recRef;
    }

    // Pickup update.
    const pickupUpdate = {
      status: 'completed',
      actual_weight_lbs: weight,
      completed_at: nowIso,
      completed_at_ts: now,
      hours_earned: hours,
    };
    if (receiptPath) {
      pickupUpdate.tax_receipt_id = recRef.id;
      pickupUpdate.tax_receipt_url = `https://betternatureofficial.org/receipt.html?id=${encodeURIComponent(recRef.id)}`;
      pickupUpdate.delivered_visible_to_restaurant = true;
    }
    if (outcome === 'spoiled') {
      pickupUpdate.spoiled = true;
      pickupUpdate.spoiled_kind = spoiledKind;
      pickupUpdate.spoiled_note = spoiledNote;
    }
    if (dropoffPhotoUrl) pickupUpdate.dropoff_photo_url = dropoffPhotoUrl;
    if (outcome === 'delivered' && fridgeOverride && fridgeOverride.fridge_id !== pk.fridge_id) {
      Object.assign(pickupUpdate, fridgeOverride, { fridge_changed_at: nowIso });
    }
    if (outcome === 'delivered' && !pk.verified_by_restaurant_at && unverifiedNote) {
      pickupUpdate.handoff_unverified = true;
      pickupUpdate.handoff_unverified_note = unverifiedNote;
      pickupUpdate.handoff_unverified_at = nowIso;
    }
    tx.update(pkRef, pickupUpdate);

    // Immutable completion sentinel — the single source of truth
    // for every downstream derivation + replay authorization.
    tx.create(compRef, {
      pickup_id: pickupId,
      outcome,
      actor_uid: caller,
      actor_role: callerIsExec ? 'exec' : 'claimant',
      claimant_uid: claimantUid,
      restaurant_id: pk.restaurant_id || null,
      weight, meals, hours, points,
      receipt_id: receiptPath ? recRef.id : null,
      override: !!override,
      override_reason: overrideReason || null,
      committed_at: now,
      committed_at_iso: nowIso,
    });

    // Member activity — deterministic id, derive deltas from the
    // frozen record so a future retry of this operation can't
    // disagree. Skipped when there's no claimant (exec completes a
    // pickup that was never claimed).
    if (claimantUid && (outcome === 'delivered' || outcome === 'exec_override')) {
      tx.create(actRef, {
        user_id: claimantUid,
        date: nowIso.split('T')[0],
        project: 'iris',
        meals, lbs: weight, hours, events: 1, points,
        raised: 0,
        source_type: 'pickup_complete',
        source_id: pickupId,
        outcome,
        created_at: now,
      });
    }

    // Claimant totals — bump via increment() under the same tx so
    // a conflict retry sees the latest state. Only the FIRST
    // completion of this pickup lands here (the sentinel's absence
    // is the only gate).
    if (claimantUid && claimantSnap?.exists && (outcome === 'delivered' || outcome === 'exec_override')) {
      tx.update(claimantSnap.ref, {
        meals_rescued: admin.firestore.FieldValue.increment(meals),
        lbs_rescued:   admin.firestore.FieldValue.increment(weight),
        hours_logged:  admin.firestore.FieldValue.increment(hours),
        events_attended: admin.firestore.FieldValue.increment(1),
        points: admin.firestore.FieldValue.increment(points),
        leaderboard_score: admin.firestore.FieldValue.increment(points),
        pickups_completed: admin.firestore.FieldValue.increment(1),
      });
    }

    // Tax receipt — delivered only. Uses the deterministic id;
    // schema matches website/receipt.html expectations (R6).
    if (receiptPath) {
      // Volunteer attribution: the claimant, NOT the actor (R6).
      const volunteerName = claimantSnap?.data()?.name || claimantSnap?.data()?.display_name || '';
      tx.create(recRef, {
        pickup_id: pickupId,
        restaurant_id: pk.restaurant_id || null,
        restaurant_name: pk.restaurant_name || '',
        restaurant_email: null,
        weight_lbs: weight,
        meals_equivalent: meals,
        picked_up_at: nowIso,
        volunteer_name: volunteerName,
        chapter_name: pk.chapter_name || '',
        receipt_no: receiptNo,
        issued_at: now,
        issued_at_iso: nowIso,
        no_goods_or_services: true,
        org: ORG_INFO,
        dropoff_photo_url: dropoffPhotoUrl || pk.dropoff_photo_url || null,
        fridge_name: (fridgeOverride && fridgeOverride.fridge_name) || pk.fridge_name || null,
        fridge_address: (fridgeOverride && fridgeOverride.fridge_address) || pk.fridge_address || null,
      });
    }

    // Org counters — inside the tx (R5). Only delivered + override
    // bump; spoiled is zero across the board. The lbs → meals/co2/
    // water conversions mirror services/orgStats.js so dashboard
    // consumers stay consistent.
    if (outcome === 'delivered' || outcome === 'exec_override') {
      const mealsFromLbs = Math.round(weight * 1.2);
      const co2FromLbs   = Math.round(weight * 3.8);   // kg CO2e per lb food saved
      const waterFromLbs = Math.round(weight * 175);   // gallons per lb
      tx.set(orgRef, {
        lbs:   admin.firestore.FieldValue.increment(weight),
        meals: admin.firestore.FieldValue.increment(mealsFromLbs),
        co2:   admin.firestore.FieldValue.increment(co2FromLbs),
        water: admin.firestore.FieldValue.increment(waterFromLbs),
        hours: admin.firestore.FieldValue.increment(hours),
        events: admin.firestore.FieldValue.increment(1),
        updated_at: now,
      }, { merge: true });
    }

    // Notification intent — write durable work doc INSIDE the tx so
    // a client crash after the response can't lose it (R7). The A2
    // sweep resumes any pending work; this piggybacks on that
    // pipeline rather than inventing a competing dispatcher.
    if (pk.restaurant_id) {
      const dedupKey = dedupKeyFor(pickupId);
      const workRef = db.doc(`notification_work/${dedupKey.replace(/[\/\s]/g, '_').slice(0, 400)}`);
      const dedupRef = db.doc(`notification_dedup/${dedupKey.replace(/[\/\s]/g, '_').slice(0, 400)}`);
      // The restaurant owner uid is a separate lookup; we store
      // the restaurant_id and let the sweep's queueBusinessNotification
      // path resolve the owner from /restaurants (B3).
      const title = outcome === 'spoiled'
        ? "Pickup didn't make it"
        : (receiptPath ? 'Delivered — tax receipt ready' : 'Your surplus made it');
      const body = outcome === 'spoiled'
        ? `Your donation couldn't be delivered. No tax receipt will be issued for this run.${spoiledNote ? ' Note: ' + spoiledNote : ''}`
        : `Your donation is delivered${pk.fridge_name ? ' at ' + pk.fridge_name : ''}. ~${meals} meals (${weight} lbs).${receiptPath ? ' Open the receipt to print or save as PDF.' : ''}`;
      const url = receiptPath
        ? `https://betternatureofficial.org/receipt.html?id=${encodeURIComponent(recRef.id)}`
        : `https://app.betternatureofficial.org/#/pickups/${pickupId}`;
      // Resolve the partner uid via /restaurants (B3 pattern).
      // Note: fetching restaurant inside the tx so the recipient is
      // frozen with the completion.
      const rSnap = await tx.get(db.doc(`restaurants/${pk.restaurant_id}`));
      const partnerUid = rSnap.exists ? (rSnap.data()?.user_id || null) : null;
      tx.set(workRef, {
        key: dedupKey,
        status: 'pending',
        attempts: 0,
        scope: 'pickup',
        kind: 'pickup',
        title, body, url,
        data: {
          type: outcome === 'spoiled' ? 'pickup_spoiled' : (receiptPath ? 'tax_receipt' : 'pickup_delivered_restaurant'),
          pickupId, meals, lbs: weight,
          receiptId: receiptPath ? recRef.id : null,
          outcome,
        },
        recipients: partnerUid ? [partnerUid] : [],
        created_at: now,
        last_attempt_at: now,
      });
      tx.set(dedupRef, {
        key: dedupKey,
        status: 'in_progress',
        started_at: now,
      }, { merge: true });
    }

    return {
      cached: false,
      outcome,
      pickup_id: pickupId,
      receipt_id: receiptPath ? recRef.id : null,
      actual_weight_lbs: weight,
      hours_earned: hours,
      meals,
      spoiled: outcome === 'spoiled',
      override: !!override,
    };
  });

  // Audit append (append-only; best-effort; completion stands
  // regardless). The sentinel is the authoritative audit record;
  // this row is for cross-pickup activity reporting.
  try {
    await db.collection('audit_events').add({
      actor_uid: caller,
      action: 'pickup_complete',
      pickup_id: pickupId,
      outcome: result.outcome,
      override: !!result.override,
      cached: !!result.cached,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('audit_events append failed', e?.message); }

  return { ok: true, ...result };
});
