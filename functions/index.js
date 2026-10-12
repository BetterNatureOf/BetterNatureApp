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
admin.initializeApp();

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

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

exports.sendPushOnNotification = functions.firestore
  .document('notifications/{notifId}')
  .onCreate(async (snap) => {
    const n = snap.data();
    if (!n?.user_id) return null;

    // Pull the recipient's stored tokens. Skip if none.
    const userSnap = await admin.firestore().doc(`users/${n.user_id}`).get();
    const tokens = (userSnap.exists && userSnap.data().push_tokens) || [];
    if (!tokens.length) return null;

    // Expo accepts an array of message objects per request, max 100.
    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: n.title || 'BetterNature',
      body: n.body || '',
      data: n.data || {},
      channelId: 'default',
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

exports.recordPickupRelease = require('./recordPickupRelease').recordPickupRelease;

exports.dispatchPickupTransition = require('./dispatchPickupTransition').dispatchPickupTransition;
