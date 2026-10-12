// A2 ID workflow — mirror /id_reviews/{uid}.status back to
// /users/{uid}.verification_status so legacy eligibility gates
// (requireVerifiedId / ID gate screens / Firestore rules that read
// verification_status elsewhere) continue to work after the ID
// evidence moved out of /users.
//
// Admin SDK bypasses rules so this trigger can write
// verification_status even though clients cannot. Idempotent:
// writes only when the two sides disagree.

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'none', 'unverified']);

exports.syncIdReviewStatus = functions
  .runWith({ failurePolicy: true })
  .firestore
  .document('id_reviews/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const userRef   = admin.firestore().doc(`users/${uid}`);
    const reviewRef = admin.firestore().doc(`id_reviews/${uid}`);
    try {
      // F3 — derive the mirrored status from the CURRENT review doc
      // read inside the transaction, not the trigger event's `after`
      // snapshot. A delayed "approved" event firing after the review
      // was flipped back to "pending" (rejection + resubmission)
      // would otherwise reset verification_status to approved.
      await admin.firestore().runTransaction(async (tx) => {
        const [uSnap, rSnap] = await Promise.all([tx.get(userRef), tx.get(reviewRef)]);
        if (!uSnap.exists) return;
        const liveStatus = rSnap.exists ? (rSnap.data().status || null) : null;
        if (liveStatus != null && !VALID_STATUSES.has(liveStatus)) return;
        const current = uSnap.data().verification_status || null;
        if (current === liveStatus) return;
        tx.update(userRef, {
          verification_status: liveStatus,
          verification_reviewed_at:
            liveStatus === 'approved' || liveStatus === 'rejected'
              ? FieldValue.serverTimestamp()
              : null,
        });
      });
    } catch (e) {
      console.error('[syncIdReviewStatus]', uid, e?.message);
      throw e; // paired with failurePolicy for retries
    }
    return null;
  });
