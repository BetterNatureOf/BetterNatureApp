// Firestore retains the transition event if the app closes before notification.
// Retriable trigger persists frozen A2 work before attempting either channel.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { _idempotencyKeyForPickup: keyFor } = require('./queueNotification');
const stampKey = (t) => t && Number.isInteger(t.seconds) && Number.isInteger(t.nanoseconds)
  ? `${t.seconds}:${t.nanoseconds}` : null;
function transitionOf(before, after) {
  if (!before.claimed_by || after.claimed_by != null || after.status !== 'available') return null;
  for (const transition of ['handoff', 'release']) {
    const field = `${transition === 'handoff' ? 'handoff' : 'released'}_at`;
    if (!stampKey(after[field]) || stampKey(after[field]) === stampKey(before[field])) continue;
    const actor = transition === 'handoff' ? after.handoff_from_uid : after.released_by;
    if (actor !== before.claimed_by) continue;
    if (transition === 'handoff' && ['claimed', 'enroute'].includes(before.status)) return transition;
    if (transition === 'release' && before.status === 'claimed' && after.verified_by_restaurant_at == null) return transition;
  }
  return null;
}
async function dispatch(change, context, database = admin.firestore(), deliver) {
  const before = change.before.data(), after = change.after.data();
  const transition = transitionOf(before, after);
  if (!transition) return { ignored: true };
  const pickupId = context.params.pickupId;
  const key = keyFor({ ...after, id: pickupId }, 'to_partner', transition);
  if (!key || key.includes('/')) throw new Error('Invalid transition notification key');
  const workRef = database.doc(`notification_work/${key}`);
  const dedupRef = database.doc(`notification_dedup/${key}`);
  await database.runTransaction(async (tx) => {
    const [work, receipt] = await tx.getAll(workRef, dedupRef);
    // A prior client or trigger invocation already froze this operation.
    if (work.exists) return;
    if (!after.restaurant_id || typeof after.restaurant_id !== 'string' || after.restaurant_id.includes('/')) {
      throw new Error(`Missing restaurant for ${pickupId}`);
    }
    const restaurant = await tx.get(database.doc(`restaurants/${after.restaurant_id}`));
    const owner = restaurant.exists && restaurant.data().user_id;
    if (typeof owner !== 'string' || !owner || owner.includes('/')) throw new Error(`Missing partner owner for ${pickupId}`);
    const reason = String(transition === 'release' ? after.cancel_reason || '' : after.handoff_reason || '').slice(0, 500);
    const stamp = FieldValue.serverTimestamp();
    const title = transition === 'release' ? 'Pickup released' : 'Volunteer handoff in progress';
    const body = transition === 'release'
      ? 'A volunteer released your pickup. Open the pickup to see its current availability.'
      : `${String(after.handoff_from_name || 'The volunteer').slice(0, 100)} requested a handoff of your pickup. Open the pickup to see its current assignment.`;
    tx.create(workRef, { key, status: 'pending', attempts: 0, created_at: stamp, last_attempt_at: stamp,
      scope: 'pickup', kind: 'pickup', title, body: `${body}${reason ? ' Reason: ' + reason : ''}`,
      url: `https://app.betternatureofficial.org/#/pickups/${encodeURIComponent(pickupId)}`,
      data: { type: transition === 'release' ? 'pickup_released' : 'pickup_handoff', pickupId },
      recipients: [owner], transition, source: 'pickup_transition_trigger' });
    if (!receipt.exists) tx.create(dedupRef, { key, status: 'in_progress', reserved_at: stamp });
  });
  // The same dispatcher and scheduled sweep preserve existing read/sent state.
  const send = deliver || require('./dispatchPickupCompletion')._dispatch;
  await send({ data: () => ({ notification_keys: [key] }) });
  return { key, transition };
}
exports.dispatchPickupTransition = functions.runWith({ failurePolicy: true })
  .firestore.document('pickups/{pickupId}').onUpdate(dispatch);
exports._dispatch = dispatch;
exports._transitionOf = transitionOf;
