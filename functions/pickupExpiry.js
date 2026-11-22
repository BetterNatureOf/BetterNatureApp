const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const BATCH_SIZE = 50;

function cutoffMillis(value) {
  return typeof value === 'string' ? Date.parse(value) : value?.toMillis?.();
}

function canExpire(pickup, now) {
  if (!pickup || !['available', 'pending_destination'].includes(pickup.status) ||
      pickup.claimed_by || pickup.safety_hold || pickup.verified_by_restaurant_at ||
      pickup.handoff_from_uid || pickup.receiving_receipt) return false;
  const destination = pickup.destination_confirmation;
  const pickupBy = cutoffMillis(destination?.pickup_by ?? pickup.pickup_window_until);
  const arrivalBy = cutoffMillis(destination?.arrival_by);
  return (Number.isFinite(pickupBy) && pickupBy <= now) ||
    (Number.isFinite(arrivalBy) && arrivalBy <= now);
}

async function expireOpenPickups(db, now = Date.now(), { limit = BATCH_SIZE } = {}) {
  const pickups = db.collection('pickups');
  const open = pickups.where('status', 'in', ['available', 'pending_destination']);
  const cutoff = Timestamp.fromMillis(now);
  // The legacy field is stored as an ISO string. Recheck the canonical
  // deadline after reading it, since newer offers also carry a timestamp.
  const windows = [
    ['destination_confirmation.pickup_by', cutoff],
    ['destination_confirmation.arrival_by', cutoff],
    ['pickup_window_until', cutoff.toDate().toISOString()],
  ];
  const pages = await Promise.all(windows.map(([field, value]) =>
    open.where(field, '<=', value).limit(limit).get()));
  const candidates = new Map(pages.flatMap((page) => page.docs.map((doc) => [doc.id, doc])));
  let expired = 0;

  for (const candidate of candidates.values()) {
    if (!canExpire(candidate.data(), now)) continue;
    const closed = await db.runTransaction(async (tx) => {
      const pickup = (await tx.get(candidate.ref)).data();
      if (!canExpire(pickup, now)) return false;

      let donor = pickup.restaurant_user_id || pickup.restaurant_id;
      if (!pickup.restaurant_user_id && pickup.restaurant_id) {
        const restaurant = await tx.get(db.collection('restaurants').doc(pickup.restaurant_id));
        donor = restaurant.data()?.user_id || donor;
      }
      tx.update(candidate.ref, {
        status: 'cancelled',
        cancel_reason: 'Pickup window expired',
        cancelled_at: new Date(now).toISOString(),
      });
      if (donor) {
        tx.create(db.collection('notifications').doc(), {
          user_id: donor, kind: 'pickup', title: 'Pickup window expired',
          body: 'The rescue closed without a pickup. Open Better Nature to review the offer.',
          url: `https://app.betternatureofficial.org/#/pickups/${encodeURIComponent(candidate.id)}`,
          read: false, created_at: FieldValue.serverTimestamp(),
        });
      }
      return true;
    });
    if (closed) expired++;
  }
  return { expired };
}

module.exports = { expireOpenPickups };
