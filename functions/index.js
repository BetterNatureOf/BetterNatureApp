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
const { KIND, offerDeadline, offerIsOpen, wantsPickupAlert } = require('./pickupAlerts');
const rescueDispatch = require('./rescueDispatch');
const { assignPickupReceiver } = require('./pickupReceiving');
const { volunteerHistory } = require('./volunteerHistory');
const { expireOpenPickups } = require('./pickupExpiry');
const { eventCheckedIn, volunteerSignedUp } = require('./impactCounters');
const { creditReferral } = require('./referralCredit');
admin.initializeApp();
const { FieldValue } = require('firebase-admin/firestore');

// A2 — mirror /users → /public_profiles with a strict allowlist.
// Only writer to the public collection. See syncPublicProfile.js
// for the allowlist and rationale.
exports.syncPublicProfileOnWrite = require('./syncPublicProfile').syncPublicProfileOnWrite;

// A2 R4 — short-lived signed URL for ID evidence. See idViewer.js.
exports.getIdViewUrl = require('./idViewer').getIdViewUrl;

// A2 R-followup #3 — authorized cross-user notification queue.
exports.queueBusinessNotification = require('./queueNotification').queueBusinessNotification;

// A2 ID workflow — mirror id_reviews.status → users.verification_status.
exports.syncIdReviewStatus = require('./syncIdReviewStatus').syncIdReviewStatus;

// A2 I2 — scheduled takeover for stuck in-progress dedup receipts.
exports.sweepNotificationDedup = require('./sweepNotificationDedup').sweepNotificationDedup;

// C1 — server-authorized idempotent pickup completion.
exports.completePickupOperation = require('./completePickup').completePickupOperation;
exports.dispatchPickupCompletion = require('./dispatchPickupCompletion').dispatchPickupCompletion;

// Referral credit (see referralCredit.js).
exports.creditReferralOnProfile = functions.firestore
  .document('users/{uid}')
  .onWrite((change, context) => creditReferral(admin.firestore(), context.params.uid,
    change.before.exists ? change.before.data() : null,
    change.after.exists ? change.after.data() : null));

// Public impact counters for activity that does not go through the
// completePickupOperation callable (which updates org_stats itself in
// its completion transaction). See impactCounters.js.
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

// Receiving sites (see receivingSites.js).
exports.confirmRescueDestination = functions.https.onCall((data, context) =>
  require('./receivingSites').confirmDestination(admin.firestore(), data, context.auth?.uid));
exports.recordRescueRemainder = functions.https.onCall((data, context) =>
  require('./receivingSites').recordRemainder(admin.firestore(), data, context.auth?.uid));
exports.reconcileSiteReservation = functions.runWith({ failurePolicy: true }).firestore
  .document('pickups/{pickupId}')
  .onUpdate((change) => require('./receivingSites').reconcileReservation(admin.firestore(),
    change.after.ref, change.before.data(), change.after.data()));

exports.listCustodyCandidates = functions.https.onCall((data, context) =>
  require('./custodyCandidates').listCustodyCandidates(admin.firestore(), data, context.auth?.uid));

exports.volunteerImpact = functions.https.onCall((data, context) =>
  require('./impactReports').volunteerImpact(admin.firestore(), data, context.auth?.uid));
exports.chapterImpact = functions.https.onCall((data, context) =>
  require('./impactReports').chapterImpact(admin.firestore(), data, context.auth?.uid));

exports.suggestRescueVolunteers = functions.https.onCall((data, context) =>
  require('./rescueSuggestions').suggest(admin.firestore(), data, context.auth?.uid));

exports.manageVolunteerHistory = functions.https.onCall((data, context) =>
  volunteerHistory(admin.firestore(), data, context.auth?.uid));

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Rescue dispatch (see rescueDispatch.js): bounded alert rounds,
// expansion, release recovery, coordinator escalation.
exports.dispatchRescueOffer = functions.runWith({ failurePolicy: true }).firestore
  .document('pickups/{pickupId}')
  .onUpdate((change) => rescueDispatch.onPickupChange(admin.firestore(), change.after.ref, change.after.data()));

exports.advanceRescueDispatch = functions.pubsub.schedule('every 2 minutes').onRun(async () => {
  const results = await rescueDispatch.advanceDue(admin.firestore());
  if (results.length) console.log('Rescue dispatch advanced', JSON.stringify(results));
});

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
          push_tokens: FieldValue.arrayRemove(...stale),
        });
      }
    } catch (e) {
      console.error('expo push send failed', e);
    }
    return null;
  });

exports.recordPickupRelease = require('./recordPickupRelease').recordPickupRelease;

exports.dispatchPickupTransition = require('./dispatchPickupTransition').dispatchPickupTransition;
