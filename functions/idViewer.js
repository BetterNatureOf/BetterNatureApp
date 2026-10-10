// A2 R4 — short-lived signed URL for an ID evidence file.
//
// Callable from the client. Authorizes caller as either the OWNER
// of the id_reviews row OR an exec reviewer (resolved via /users).
// Reads the Storage path from /id_reviews/{uid} (NOT /users) and
// returns a signed URL that expires in 5 minutes. The underlying
// object retains its rotated download token; this signed URL is a
// separate, time-boxed capability.
//
// Side `front` / `back`, kind `personal` / `driver`.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const KIND_FIELD = {
  personal: { front: 'id_front_path', back: 'id_back_path' },
  driver:   { front: 'driver_license_front_path', back: 'driver_license_back_path' },
};

async function isExecCaller(uid) {
  if (!uid) return false;
  const s = await admin.firestore().doc(`users/${uid}`).get();
  if (!s.exists) return false;
  const u = s.data() || {};
  const EXEC = ['executive', 'admin', 'super_admin'];
  const r = u.role;
  const roles = Array.isArray(u.roles) ? u.roles : [];
  return EXEC.includes(r) || roles.some((x) => EXEC.includes(x));
}

exports.getIdViewUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  const callerUid = context.auth.uid;
  const targetUid = String(data?.uid || '').trim();
  const kind = String(data?.kind || 'personal');
  const side = String(data?.side || 'front');
  if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'Missing uid.');
  if (!KIND_FIELD[kind]) throw new functions.https.HttpsError('invalid-argument', 'Unknown kind.');
  if (!['front', 'back'].includes(side)) throw new functions.https.HttpsError('invalid-argument', 'Unknown side.');

  const isOwner = callerUid === targetUid;
  const isExec = !isOwner && await isExecCaller(callerUid);
  if (!isOwner && !isExec) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized.');
  }

  const review = await admin.firestore().doc(`id_reviews/${targetUid}`).get();
  if (!review.exists) {
    throw new functions.https.HttpsError('not-found', 'No ID on file.');
  }
  const path = review.data()[KIND_FIELD[kind][side]];
  if (!path) {
    throw new functions.https.HttpsError('not-found', 'That side was not uploaded.');
  }

  const file = admin.storage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new functions.https.HttpsError('not-found', 'File gone.');
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  return { url, expires_in_s: 300 };
});
