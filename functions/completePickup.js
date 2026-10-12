// All completion artifacts, accounting, and notification work commit together.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const policy = require('./lib/donationPolicy');
const { pickupEligible: eligible } = require('./lib/pickupEligibility');
const EXEC_ROLES = new Set(['executive', 'admin', 'super_admin']);
const roles = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];
const isExec = (u) => roles(u).some((r) => EXEC_ROLES.has(r));
const error = (code, message, reason) => new functions.https.HttpsError(code, message, { reason });
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const toMs = (value) => value?.toMillis ? value.toMillis()
  : value?.seconds != null ? value.seconds * 1000 : Date.parse(value);

async function complete(data, context) {
  if (!context.auth) throw error('unauthenticated', 'Sign in required.', 'sign_in');
  const caller = context.auth.uid;
  const id = text(data?.pickup_id, 180);
  if (!id || id.includes('/')) throw error('invalid-argument', 'Valid pickup_id required.', 'pickup_id');
  const override = data?.override === true;
  const overrideReason = text(data?.override_reason, 500);
  const spoiled = data?.spoiled === true;
  const weight = spoiled ? 0 : data?.actual_weight_lbs;
  const note = text(data?.unverified_note, 500);
  const photo = text(data?.dropoff_photo_url, 1024) || null;
  const fridgeId = text(data?.fridge_id, 180);
  if (fridgeId.includes('/')) throw error('invalid-argument', 'Invalid fridge_id.', 'fridge_id');
  const db = admin.firestore();
  const pkRef = db.doc(`pickups/${id}`), opRef = db.doc(`pickup_completions/${id}`);
  const actRef = db.doc(`member_activity/pickup_${id}`), recRef = db.doc(`tax_receipts/rcpt_${id}`);
  const orgRef = db.doc('org_stats/global');
  return db.runTransaction(async (tx) => {
    const [pkSnap, opSnap, actorSnap, actSnap, recSnap, orgSnap] = await tx.getAll(
      pkRef, opRef, db.doc(`users/${caller}`), actRef, recRef, orgRef,
    );
    if (!pkSnap.exists) throw error('not-found', 'Pickup not found.', 'pickup_missing');
    const pk = pkSnap.data(), actor = actorSnap.exists ? actorSnap.data() : null;
    // Authorization precedes cached-result access, and reads current roles.
    if (!actor || actor.disabled || actor.deleted || actor.deleted_at || actor.merged_into) {
      throw error('permission-denied', 'Active account required.', 'claimant_disabled');
    }
    if (override && (!isExec(actor) || !overrideReason)) {
      throw error('permission-denied', 'Executive override requires an audit reason.', 'override_forbidden');
    }
    if (!override && pk.claimed_by !== caller) throw error('permission-denied', 'Only the claimant may complete.', 'not_claimant');
    if (!override && !eligible(actor)) throw error('failed-precondition', 'Approved ID, agreement, and driver setup required.', 'claimant_ineligible');
    if (opSnap.exists) {
      if (pk.status !== 'completed') throw error('failed-precondition', 'Completion record conflicts with pickup.', 'completion_conflict');
      return { ok: true, ...opSnap.data().result, cached: true };
    }
    // Legacy/partial records require reconciliation, never guessed increments.
    if (pk.status === 'completed' || actSnap.exists || recSnap.exists) {
      throw error('failed-precondition', 'Existing completion artifacts require reconciliation.', 'legacy_completion');
    }
    if (pk.status === 'cancelled') throw error('failed-precondition', 'Pickup was cancelled.', 'cancelled');
    if (!override && !spoiled && pk.status !== 'enroute') throw error('failed-precondition', 'Pickup must be enroute.', 'not_enroute');
    if (spoiled && !override && !['claimed', 'enroute'].includes(pk.status)) {
      throw error('failed-precondition', 'Spoiled report requires in-progress pickup.', 'not_enroute');
    }
    if (!spoiled && (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0)) {
      throw error('invalid-argument', 'Enter positive actual pounds delivered.', 'weight_required');
    }
    if (!override && !spoiled && !pk.verified_by_restaurant_at && !note) {
      throw error('failed-precondition', 'Restaurant has not confirmed handoff.', 'handoff_not_confirmed');
    }
    const claimantUid = pk.claimed_by || null;
    const claimantSnap = claimantUid && claimantUid !== caller ? await tx.get(db.doc(`users/${claimantUid}`)) : claimantUid ? actorSnap : null;
    if (claimantUid && !claimantSnap?.exists) throw error('failed-precondition', 'Claimant profile missing.', 'claimant_missing');
    const restaurantSnap = pk.restaurant_id ? await tx.get(db.doc(`restaurants/${pk.restaurant_id}`)) : null;
    const restaurant = restaurantSnap?.exists ? restaurantSnap.data() : {}, partnerUid = restaurant.user_id || null;
    if (!spoiled && (!restaurantSnap?.exists || !partnerUid)) throw error('failed-precondition', 'Identified food partner required.', 'partner_missing');
    const fridgeSnap = fridgeId ? await tx.get(db.doc(`fridges/${fridgeId}`)) : null;
    if (fridgeId && !fridgeSnap.exists) throw error('not-found', 'Destination fridge not found.', 'fridge_missing');
    const fridge = fridgeSnap?.exists ? fridgeSnap.data() : null;
    const nowMs = Date.now(), iso = new Date(nowMs).toISOString();
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    const anchor = toMs(pk.enroute_at) || toMs(pk.claimed_at);
    if (!spoiled && claimantUid && (!Number.isFinite(anchor) || anchor > nowMs)) {
      throw error('failed-precondition', 'Pickup start time needs correction.', 'invalid_start_time');
    }
    const hours = spoiled || !claimantUid ? 0 : Math.max(0.25, Math.min(3, +((nowMs - anchor) / 3600000).toFixed(2)));
    const meals = Math.round(weight * policy.MEALS_PER_LB);
    const points = spoiled || !claimantUid ? 0 : 10 + Math.min(50, meals), events = spoiled || !claimantUid ? 0 : 1;
    const receiptId = spoiled ? null : recRef.id;
    // Unique immutable numbering avoids count()+1 races and legacy collisions.
    const receiptNo = spoiled ? null : `BN-${id}`;
    const receiptUrl = receiptId ? `https://betternatureofficial.org/receipt.html?id=${encodeURIComponent(receiptId)}` : null;
    const result = { pickup_id: id, receipt_id: receiptId, receipt_no: receiptNo,
      actual_weight_lbs: weight, hours_earned: hours, meals, spoiled };
    const pickupUpdate = { status: 'completed', completed_at: iso, completed_at_ts: stamp,
      actual_weight_lbs: weight, hours_earned: hours, spoiled, tax_receipt_id: receiptId, tax_receipt_url: receiptUrl,
      delivered_visible_to_restaurant: !spoiled };
    if (spoiled) Object.assign(pickupUpdate, { spoiled_kind: text(data?.spoiled_kind, 40) || 'food_spoiled', spoiled_note: text(data?.spoiled_note, 500) });
    if (photo) pickupUpdate.dropoff_photo_url = photo;
    if (fridge) Object.assign(pickupUpdate, { fridge_id: fridgeId, fridge_name: fridge.name || '',
      fridge_address: fridge.address || '', fridge_lat: fridge.lat ?? null, fridge_lng: fridge.lng ?? null, fridge_changed_at: iso });
    if (!spoiled && !pk.verified_by_restaurant_at) Object.assign(pickupUpdate, {
      handoff_unverified: true, handoff_unverified_note: note || overrideReason, handoff_unverified_at: iso });
    const jobs = [];
    if (claimantUid && !spoiled) jobs.push({ recipient: claimantUid, suffix: 'volunteer', kind: 'pickup', title: 'Pickup complete!',
      body: `You rescued ~${meals} meals. Your hours and impact are logged.`,
      url: `https://app.betternatureofficial.org/#/pickups/${id}`, data: { type: 'pickup_complete', pickupId: id } });
    if (partnerUid) jobs.push({ recipient: partnerUid, suffix: 'partner', kind: 'pickup',
      title: spoiled ? 'Pickup reported spoiled' : 'Delivered — donation receipt ready',
      body: spoiled ? 'Spoiled food was reported. No delivered-food receipt was issued.' : `Your donation was delivered: ${weight} lbs, ~${meals} meals. Open your receipt to print or save.`,
      url: receiptUrl || `https://app.betternatureofficial.org/#/pickups/${id}`,
      data: { type: spoiled ? 'pickup_spoiled' : 'tax_receipt', pickupId: id, receiptId } });
    const notificationKeys = jobs.map((job) => `completion:${id}:${job.suffix}`);
    tx.update(pkRef, pickupUpdate);
    if (claimantUid) {
      tx.create(actRef, { user_id: claimantUid, date: iso.split('T')[0], project: 'iris', meals, lbs: weight,
        hours, events, points, raised: 0, source_type: spoiled ? 'pickup_spoiled' : 'pickup_complete', source_id: id, created_at: stamp });
      const inc = admin.firestore.FieldValue.increment;
      tx.update(claimantSnap.ref, { meals_rescued: inc(meals), lbs_rescued: inc(weight), hours_logged: inc(hours),
        events_attended: inc(events), points: inc(points), leaderboard_score: inc(points), pickups_completed: inc(spoiled ? 0 : 1) });
    }
    if (!spoiled) {
      const pickupDate = toMs(pk.verified_by_restaurant_at) || toMs(pk.claimed_at) || nowMs;
      tx.create(recRef, { pickup_id: id, restaurant_id: pk.restaurant_id, restaurant_name: restaurant.name || pk.restaurant_name || '',
        weight_lbs: weight, meals_equivalent: meals, picked_up_at: new Date(pickupDate).toISOString(),
        volunteer_name: claimantSnap?.data()?.name || '', chapter_name: pk.chapter_name || '', receipt_no: receiptNo,
        issued_at: stamp, issued_at_iso: iso, org: policy.ORG_INFO, no_goods_or_services: true,
        handoff_unverified: !pk.verified_by_restaurant_at, handoff_unverified_note: !pk.verified_by_restaurant_at ? note || overrideReason : null,
        dropoff_photo_url: photo || pk.dropoff_photo_url || null, fridge_name: fridge?.name || pk.fridge_name || null,
        fridge_address: fridge?.address || pk.fridge_address || null });
    }
    const org = orgSnap.exists ? orgSnap.data() : {};
    const deltas = { lbs: weight, meals, co2: Math.round(weight * policy.CO2_LB_PER_LB), water: Math.round(weight * policy.WATER_GAL_PER_LB), hours, events };
    const totals = Object.fromEntries(Object.entries(deltas).map(([key, delta]) => [key, (Number(org[key]) || 0) + delta]));
    tx.set(orgRef, { ...totals, updated_at: stamp }, { merge: true });
    tx.create(db.doc(`audit_events/pickup_${id}`), { actor_uid: caller, claimant_uid: claimantUid,
      action: spoiled ? 'pickup_spoiled' : 'pickup_complete', pickup_id: id, override, override_reason: override ? overrideReason : null, at: stamp });
    jobs.forEach((job, index) => {
      const key = notificationKeys[index];
      tx.create(db.doc(`notification_dedup/${key}`), { key, status: 'in_progress', reserved_at: stamp });
      tx.create(db.doc(`notification_work/${key}`), { key, status: 'pending', attempts: 0, created_at: stamp, last_attempt_at: stamp,
        scope: 'pickup', kind: job.kind, title: job.title, body: job.body, url: job.url, data: job.data, recipients: [job.recipient] });
    });
    tx.create(opRef, { actor_uid: caller, claimant_uid: claimantUid, result, notification_keys: notificationKeys, created_at: stamp, schema_version: 1 });
    return { ok: true, ...result, cached: false };
  });
}
exports.completePickupOperation = functions.https.onCall(complete);
exports._complete = complete;
