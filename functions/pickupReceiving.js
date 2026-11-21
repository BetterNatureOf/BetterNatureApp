const { FieldValue } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v1/https');

const staffRoles = ['executive', 'admin', 'super_admin'];

async function assignPickupReceiver(db, auth, input, callerUid) {
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in to assign receiving staff.');
  const pickupId = input?.pickupId;
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  if (typeof pickupId !== 'string' || !pickupId || pickupId.includes('/') ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter the receiving staff member’s account email.');
  }
  const callerRef = db.collection('users').doc(callerUid);
  const isStaff = (profile) => profile && !profile.disabled && !profile.deleted_at &&
    [profile.role, ...(profile.roles || [])].some((role) => staffRoles.includes(role));
  if (!isStaff((await callerRef.get()).data())) {
    throw new HttpsError('permission-denied', 'Only Better Nature staff can assign a receiver.');
  }

  let account;
  try {
    account = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  if (!account?.emailVerified || account.disabled) {
    throw new HttpsError('failed-precondition', 'Use a Better Nature account with a verified email.');
  }
  const pickupRef = db.collection('pickups').doc(pickupId);
  const receiverRef = db.collection('users').doc(account.uid);
  const alertRef = db.collection('notifications').doc();
  await db.runTransaction(async (tx) => {
    const [caller, pickupSnap, receiverSnap] = await Promise.all([
      tx.get(callerRef), tx.get(pickupRef), tx.get(receiverRef),
    ]);
    if (!isStaff(caller.data())) throw new HttpsError('permission-denied', 'Receiving access requires staff permission.');
    const pickup = pickupSnap.data();
    const receiver = receiverSnap.data();
    if (!pickup?.destination_confirmation || !['available', 'claimed', 'enroute'].includes(pickup.status) ||
        pickup.receiving_receipt || pickup.safety_hold) {
      throw new HttpsError('failed-precondition', 'Receiving staff can only be assigned to an open rescue with a confirmed site.');
    }
    if (!receiver || receiver.disabled || receiver.deleted_at || receiver.role === 'restaurant' ||
        receiver.member_status === 'rejected' || account.uid === pickup.claimed_by ||
        [pickup.restaurant_id, pickup.restaurant_user_id].includes(account.uid)) {
      throw new HttpsError('failed-precondition', 'Choose a separate, active Better Nature account for receiving.');
    }
    if (pickup.receiver_uid === account.uid) return;
    tx.update(pickupRef, { receiver_uid: account.uid, receiver_assigned_by: callerUid, receiver_assigned_at: FieldValue.serverTimestamp() });
    tx.create(alertRef, {
      user_id: account.uid,
      kind: 'pickup',
      title: 'You’re assigned to receive a rescue',
      body: 'Open Better Nature to review the expected delivery.',
      url: `https://app.betternatureofficial.org/#/pickups/${encodeURIComponent(pickupId)}`,
      read: false,
      created_at: FieldValue.serverTimestamp(),
    });
  });
}

module.exports = { assignPickupReceiver };
