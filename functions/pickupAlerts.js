const { randomUUID } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { latLngToCell, gridDisk, cellToLatLng, greatCircleDistance } = require('h3-js');
const { pickupRoadTimes } = require('./dispatchRouting');

const KIND = 'pickup_alert';
const DISPATCH_RESOLUTION = 7;
const AVAILABILITY_MS = 60 * 60_000;
const ALERT_LIMIT = 8;

function deadline(value) {
  return value?.toMillis ? value.toMillis() : typeof value === 'string' ? Date.parse(value) : NaN;
}

function offerDeadline(pickup) {
  return Math.min(deadline(pickup.destination_confirmation?.pickup_by ?? pickup.pickup_window_until),
    deadline(pickup.destination_confirmation?.arrival_by));
}

function offerIsOpen(pickup, now = Date.now()) {
  return pickup?.status === 'available' && !!pickup.chapter_id && !pickup.claimed_by &&
    !pickup.safety_hold && !pickup.verified_by_restaurant_at && !pickup.handoff_from_uid &&
    offerDeadline(pickup) > now;
}

function wantsPickupAlert(user, chapterId) {
  return user?.chapter_id === chapterId && !user.disabled && !user.deleted_at &&
    !['pending', 'rejected'].includes(user.member_status) && user.notif_pickup !== false &&
    user.verification_status === 'approved' && user.contract_volunteer_signed === true &&
    ![user.role, ...(user.roles || [])].some((role) => ['restaurant', 'partner'].includes(role));
}

async function queuePickupAlerts(db, change) {
  const previous = change.before.data();
  const opened = change.after.data();
  if (previous?.destination_confirmation || !offerIsOpen(opened)) return;

  const pickupRef = change.after.ref;
  const pickupId = pickupRef.id;
  const data = { type: 'pickup_available', pickupId };
  const url = `https://app.betternatureofficial.org/#/pickups/${encodeURIComponent(pickupId)}`;
  const { restaurant_lat: lat, restaurant_lng: lng } = opened;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
  const nearby = new Set(gridDisk(latLngToCell(lat, lng, DISPATCH_RESOLUTION), 2));
  const availability = db.collection('rescue_availability');
  const candidates = await availability.where('cell', 'in', [...nearby]).get();
  const dispatch = pickupRef.collection('dispatch').doc('nearby');
  if ((await dispatch.get()).exists) return;
  // Keep network work outside the transaction, including on transaction retries.
  const roadTimes = candidates.empty ? new Map() : await pickupRoadTimes([...nearby], [lat, lng]);

  await db.runTransaction(async (tx) => {
    const [processed, pickup] = await Promise.all([tx.get(dispatch), tx.get(pickupRef)]);
    const current = pickup.data();
    if (processed.exists || !offerIsOpen(current) || current.chapter_id !== opened.chapter_id ||
        current.restaurant_lat !== lat || current.restaurant_lng !== lng) return;
    const now = Date.now();
    const ranked = (await Promise.all(candidates.docs.map((candidate) => tx.get(candidate.ref))))
      .filter((candidate) => {
        const available = candidate.data();
        const updated = deadline(available?.updated_at);
        return nearby.has(available?.cell) && updated <= now && updated > now - AVAILABILITY_MS;
      })
      .map((candidate) => {
        const { cell } = candidate.data();
        return { uid: candidate.id, seconds: roadTimes.get(cell),
          distance: greatCircleDistance([lat, lng], cellToLatLng(cell), 'km') };
      });
    // Compare candidates on one metric. Missing durations switch the entire
    // shortlist to distance, including if a volunteer moved before commit.
    const useRoadTime = ranked.length > 0 && ranked.every((candidate) => candidate.seconds !== undefined);
    ranked.sort((a, b) => (useRoadTime ? a.seconds - b.seconds : 0) ||
      a.distance - b.distance || a.uid.localeCompare(b.uid));
    const recipients = [];
    for (const { uid } of ranked) {
      if (uid === current.receiver_uid || uid === current.restaurant_user_id || uid === current.restaurant_id) continue;
      const user = (await tx.get(db.collection('users').doc(uid))).data();
      if (!wantsPickupAlert(user, current.chapter_id)) continue;
      const active = await tx.get(db.collection('pickups').where('claimed_by', '==', uid)
        .where('status', 'in', ['claimed', 'enroute']).limit(1));
      if (!active.empty) continue;
      recipients.push({ uid, user });
      if (recipients.length === ALERT_LIMIT) break;
    }

    tx.create(dispatch, { created_at: FieldValue.serverTimestamp(), recipient_count: recipients.length,
      ranking: useRoadTime ? 'road_time' : 'distance' });
    for (const { uid, user } of recipients) {
      const alert = {
        user_id: uid,
        kind: KIND,
        title: 'Nearby food rescue',
        body: 'Open Better Nature to review the route, timing, and whether the pickup is still available.',
        url,
        data,
        created_at: FieldValue.serverTimestamp(),
      };
      tx.create(db.collection('notifications').doc(), { ...alert, read: false });
      if (user.push_enabled === true && user.onesignal_player_id) {
        tx.create(db.collection('notifications_outbox').doc(), {
          ...alert,
          channel: 'push',
          status: 'queued',
          attempts: 0,
          target: 'onesignal',
          player_id: user.onesignal_player_id,
          idempotency_key: randomUUID(),
        });
      }
    }
  });
}

module.exports = { KIND, offerDeadline, offerIsOpen, wantsPickupAlert, queuePickupAlerts };
