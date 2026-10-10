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

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'none', 'unverified']);

exports.syncIdReviewStatus = functions
  .runWith({ failurePolicy: true })
  .firestore
  .document('id_reviews/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const next = change.after.exists ? (change.after.data().status || null) : null;
    if (next != null && !VALID_STATUSES.has(next)) return null;

    const userRef = admin.firestore().doc(`users/${uid}`);
    try {
      await admin.firestore().runTransaction(async (tx) => {
        const uSnap = await tx.get(userRef);
        if (!uSnap.exists) return; // user deleted — nothing to mirror
        const current = uSnap.data().verification_status || null;
        if (current === next) return;
        tx.update(userRef, {
          verification_status: next,
          verification_reviewed_at: next === 'approved' || next === 'rejected'
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        });
      });
    } catch (e) {
      console.error('[syncIdReviewStatus]', uid, e?.message);
      throw e; // paired with failurePolicy for retries
    }
    return null;
  });
