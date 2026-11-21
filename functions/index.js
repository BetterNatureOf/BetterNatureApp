// Cloud Function: when a /notifications doc is created, look up the
// recipient's push tokens on /users/{uid} and fire an Expo push.
//
// Deploy:
//   cd functions && npm i
//   npx firebase-tools deploy --only functions
//
// Required envs (one-time, free):
//   none — Expo's push API takes the token directly.
//
// Why a function and not write-from-client: clients can't fan out
// pushes safely (rate limits, token leakage), and the existing
// app/web flow already writes /notifications docs as a side effect
// of every state change.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { KIND, offerDeadline, offerIsOpen, wantsPickupAlert, queuePickupAlerts } = require('./pickupAlerts');
const { assignPickupReceiver } = require('./pickupReceiving');
const { volunteerHistory } = require('./volunteerHistory');
const { expireOpenPickups } = require('./pickupExpiry');
const { mirrorPublicProfile, publicProfile } = require('./publicProfiles');
const { pickupCompleted, eventCheckedIn, volunteerSignedUp } = require('./impactCounters');
admin.initializeApp();

// Safe, public subset of each member's profile (see publicProfiles.js).
exports.mirrorPublicProfile = functions.firestore
  .document('users/{uid}')
  .onWrite((change, context) => mirrorPublicProfile(admin.firestore(), context.params.uid,
    change.before.exists ? change.before.data() : null,
    change.after.exists ? change.after.data() : null));

// One-time (re-runnable) fill of public_profiles for members created
// before mirrorPublicProfile was deployed. Exec only.
exports.backfillPublicProfiles = functions.https.onCall(async (_data, context) => {
  const db = admin.firestore();
  const me = context.auth?.uid ? (await db.doc(`users/${context.auth.uid}`).get()).data() : null;
  const roles = [me?.role, ...(me?.roles || [])];
  if (!roles.some((r) => ['executive', 'admin', 'super_admin'].includes(r))) {
    throw new functions.https.HttpsError('permission-denied', 'Executives only.');
  }
  const users = await db.collection('users').get();
  let written = 0;
  for (let i = 0; i < users.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of users.docs.slice(i, i + 400)) {
      const u = d.data();
      const ref = db.collection('public_profiles').doc(d.id);
      if (u.deleted_at || u.disabled === true) batch.delete(ref);
      else { batch.set(ref, { ...publicProfile(u), updated_at: admin.firestore.FieldValue.serverTimestamp() }); written += 1; }
    }
    await batch.commit();
  }
  return { written };
});

// Public impact counters — server-side only (see impactCounters.js).
exports.countCompletedPickup = functions.firestore
  .document('pickups/{pickupId}')
  .onUpdate((change, context) => pickupCompleted(admin.firestore(), context.params.pickupId,
    change.before.data(), change.after.data()));

exports.countEventCheckin = functions.firestore
  .document('member_activity/{activityId}')
  .onCreate((snap, context) => eventCheckedIn(admin.firestore(), context.params.activityId, snap.data()));

exports.countVolunteerSignup = functions.firestore
  .document('users/{uid}')
  .onCreate((snap, context) => volunteerSignedUp(admin.firestore(), context.params.uid, snap.data()));

exports.closeExpiredRescueOffers = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  const result = await expireOpenPickups(admin.firestore());
  console.log('Expired rescue offers closed', result.expired);
});

exports.assignRescueReceiver = functions.https.onCall((data, context) =>
  assignPickupReceiver(admin.firestore(), admin.auth(), data, context.auth?.uid));

exports.manageVolunteerHistory = functions.https.onCall((data, context) =>
  volunteerHistory(admin.firestore(), data, context.auth?.uid));

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

exports.alertVolunteersOnPickupConfirmation = functions.runWith({ failurePolicy: true }).firestore
  .document('pickups/{pickupId}')
  .onUpdate((change) => queuePickupAlerts(admin.firestore(), change));

exports.sendPushOnNotification = functions.firestore
  .document('notifications/{notifId}')
  .onCreate(async (snap) => {
    const n = snap.data();
    if (!n?.user_id) return null;
    if (n.data?.type === 'pickup_available' && n.kind !== KIND) return null;

    // Pull the recipient's stored tokens. Skip if none.
    const userSnap = await admin.firestore().doc(`users/${n.user_id}`).get();
    const user = userSnap.data();
    const tokens = user?.push_tokens || [];
    if (!tokens.length) return null;

    let pickupExpiry;
    if (n.kind === KIND) {
      if (!n.data?.pickupId) return null;
      const pickup = (await admin.firestore().collection('pickups').doc(n.data.pickupId).get()).data();
      if (!offerIsOpen(pickup) || !wantsPickupAlert(user, pickup.chapter_id)) return null;
      pickupExpiry = offerDeadline(pickup);
    }

    // Expo accepts an array of message objects per request, max 100.
    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: n.title || 'BetterNature',
      body: n.body || '',
      data: n.data || {},
      channelId: 'default',
      ...(pickupExpiry ? { expiration: Math.floor(pickupExpiry / 1000) } : {}),
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });
      const json = await res.json();

      // Prune tokens Expo says are no longer valid (uninstall, etc).
      const stale = [];
      (json?.data || []).forEach((r, i) => {
        if (r?.status === 'error' && (r.details?.error === 'DeviceNotRegistered')) {
          stale.push(tokens[i]);
        }
      });
      if (stale.length) {
        await admin.firestore().doc(`users/${n.user_id}`).update({
          push_tokens: admin.firestore.FieldValue.arrayRemove(...stale),
        });
      }
    } catch (e) {
      console.error('expo push send failed', e);
    }
    return null;
  });
