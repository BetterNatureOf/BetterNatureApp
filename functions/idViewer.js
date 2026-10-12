// A2 R4 — short-lived signed URL for an ID evidence file.
//
// Callable from the client. Authorizes caller as either the OWNER
// of the id_reviews row OR an exec reviewer (resolved via /users).
//
// ChatGPT follow-up #1 — defence in depth: Firestore rules now
// pattern-constrain stored *_path fields to the record owner's uid,
// but the callable MUST NOT trust that alone. If a privileged
// migration tool or a future rule relaxation ever lets a malformed
// path land in /id_reviews, this callable still refuses to sign any
// path that doesn't match the exact pattern for this uid+kind+side.
// The ID prefix is also pinned so no caller can coerce a signature
// over an unrelated bucket object.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const KIND_FIELD = {
  personal: { front: 'id_front_path',             back: 'id_back_path'             },
  driver:   { front: 'driver_license_front_path', back: 'driver_license_back_path' },
};

function pathPattern(uid, kind, side) {
  // Must mirror the pattern that firestore.rules idPathOk() accepts.
  // Example: id-docs/personal/<uid>-front-<digits>.jpg
  const escUid = String(uid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^id-docs/' + kind + '/' + escUid + '-' + side + '-[0-9]+\\.(jpe?g|png)$');
}

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
  if (!targetUid || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or malformed uid.');
  }
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
  if (!path || typeof path !== 'string') {
    throw new functions.https.HttpsError('not-found', 'That side was not uploaded.');
  }
  // Defense in depth: refuse to sign a path that doesn't match the
  // exact shape for THIS uid, kind and side. Blocks both the "owner
  // stuffed a foreign path" and "privileged bulk-write left a
  // malformed path" scenarios.
  if (!pathPattern(targetUid, kind, side).test(path)) {
    console.warn('[getIdViewUrl] path-pattern mismatch', { targetUid, kind, side });
    throw new functions.https.HttpsError('failed-precondition',
      'Stored ID path does not match this account.');
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
