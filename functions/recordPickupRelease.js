// A release is committed by the client; its accounting is retriable server work.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
const stampKey = (t) => t && Number.isInteger(t.seconds) && Number.isInteger(t.nanoseconds)
  ? `${t.seconds}:${t.nanoseconds}` : null;
const nonnegative = (n) => Number.isFinite(n) ? Math.max(0, n) : 0;
async function record(change, context, database = admin.firestore()) {
  const before = change.before.data(), after = change.after.data();
  const time = stampKey(after.released_at);
  if (before.status !== 'claimed' || after.status !== 'available' || !before.claimed_by
      || after.claimed_by != null || after.released_by !== before.claimed_by
      || after.verified_by_restaurant_at != null || !time || time === stampKey(before.released_at)) {
    return { ignored: true };
  }
  const uid = before.claimed_by, pickupId = context.params.pickupId;
  const key = createHash('sha256').update(JSON.stringify([pickupId, uid, time])).digest('hex');
  const opRef = database.doc(`pickup_releases/${key}`);
  const activityRef = database.doc(`member_activity/pickup_release_${key}`);
  const userRef = database.doc(`users/${uid}`);
  return database.runTransaction(async (tx) => {
    const [op, activity, user] = await tx.getAll(opRef, activityRef, userRef);
    if (op.exists) return { cached: true, key };
    if (activity.exists) throw new Error(`Release activity without operation ledger: ${key}`);
    const u = user.exists ? user.data() : {};
    const usable = user.exists && !u.deleted && !u.deleted_at && !u.merged_into;
    const points = usable ? -Math.min(5, nonnegative(u.points)) : 0;
    const score = usable ? -Math.min(5, nonnegative(u.leaderboard_score)) : 0;
    if (usable) {
      const latest = stampKey(u.last_drop_at) && u.last_drop_at.toMillis() > after.released_at.toMillis()
        ? u.last_drop_at : after.released_at;
      tx.update(userRef, { points: nonnegative(u.points) + points,
        leaderboard_score: nonnegative(u.leaderboard_score) + score,
        pickups_dropped: nonnegative(u.pickups_dropped) + 1, last_drop_at: latest });
    }
    const operation = { pickup_id: pickupId, actor_uid: uid, released_at: after.released_at,
      points_delta: points, leaderboard_delta: score, counter_applied: usable,
      status: usable ? 'applied' : 'profile_unavailable',
      processed_at: FieldValue.serverTimestamp() };
    tx.create(opRef, operation);
    tx.create(activityRef, { user_id: uid, date: after.released_at.toDate().toISOString().slice(0, 10),
      project: 'iris', meals: 0, hours: 0, events: 0, raised: 0, points,
      leaderboard_delta: score, source_type: 'pickup_dropped', source_id: pickupId,
      notes: after.cancel_reason || null, created_at: FieldValue.serverTimestamp() });
    tx.create(database.doc(`audit_events/pickup_release_${key}`), { ...operation, type: 'pickup_released' });
    return { cached: false, key };
  });
}
exports.recordPickupRelease = functions.runWith({ failurePolicy: true })
  .firestore.document('pickups/{pickupId}').onUpdate(record);
exports._record = record;
