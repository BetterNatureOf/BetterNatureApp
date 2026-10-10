// A2 R8/R4 — ID evidence pipeline.
//
// Replaces the previous flow that stashed a persistent download URL
// on /users (id_document_url, id_document_front_url, …). That
// pattern leaked usable bearer links to anyone with /users read
// access (presidents under A2 same-chapter rule, exec reviewers,
// legacy third-party code that still had the URL cached). The new
// flow stores ONLY the Storage path + presence flags on a dedicated
// restricted collection, and reviewers mint a short-lived signed
// URL on demand via the `getIdViewUrl` callable.
//
// /id_reviews/{uid} schema (see firestore.rules):
//   { id_front_present, id_front_path,
//     id_back_present,  id_back_path,
//     driver_license_front_present/_path, driver_license_back_present/_path,
//     status: 'pending' | 'approved' | 'rejected',
//     uploaded_at, reviewed_at, reviewed_by }
//
// Owner may write status='pending' and the path/present fields.
// Only exec may transition status to approved/rejected (enforced by
// a Cloud Function or an exec write; client self-writes stay pending).

import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, isFirebaseConfigured } from '../config/firebase';

const KIND_PATHS = {
  personal: { prefix: 'id-docs/personal', front: 'id_front', back: 'id_back' },
  driver:   { prefix: 'id-docs/driver',   front: 'driver_license_front', back: 'driver_license_back' },
};

async function uploadOne(userId, fileUri, { kind, side }) {
  const map = KIND_PATHS[kind] || KIND_PATHS.personal;
  const path = `${map.prefix}/${userId}-${side}-${Date.now()}.jpg`;
  const r = await fetch(fileUri);
  const blob = await r.blob();
  await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
  return path;
}

/**
 * Upload both sides of an ID, write ONLY the Storage path to
 * /id_reviews/{self} (never a bearer URL), mark the review pending.
 * Idempotent — a resubmission overwrites the paths and resets status
 * to 'pending', which an exec then approves/rejects.
 */
export async function submitIdReview(userId, { frontUri, backUri, kind = 'personal' } = {}) {
  if (!isFirebaseConfigured) return null;
  if (!userId) throw new Error('Missing userId.');
  if (!frontUri) throw new Error('Front of the ID is required.');
  if (!backUri)  throw new Error('Back of the ID is required.');
  if (!KIND_PATHS[kind]) throw new Error('Unknown ID kind.');

  const [frontPath, backPath] = await Promise.all([
    uploadOne(userId, frontUri, { kind, side: 'front' }),
    uploadOne(userId, backUri,  { kind, side: 'back'  }),
  ]);

  const map = KIND_PATHS[kind];
  // F6 — do NOT spread the prior document into the write. Server
  // and reviewer-only fields (reviewed_at, reviewed_by,
  // id_tokens_migrated_at) must remain unchanged on resubmission;
  // the Firestore rules on UPDATE now enforce the owner only
  // CHANGES owner-authored keys. A spread-and-set-with-merge wrote
  // every prior field back and tripped the diff-check for migrated
  // rows. We write ONLY the fields the owner is changing.
  const existingSnap = await getDoc(doc(db, 'id_reviews', userId));
  const existed = existingSnap.exists();
  const update = {
    [`${map.front}_present`]: true,
    [`${map.front}_path`]:    frontPath,
    [`${map.back}_present`]:  true,
    [`${map.back}_path`]:     backPath,
    status: 'pending',
    uploaded_at: serverTimestamp(),
  };
  // merge:true leaves everything else on the doc untouched. If the
  // row doesn't exist yet we're doing a CREATE and the rule's
  // cleanIdReviewOwnerCreate accepts exactly the keys above.
  await setDoc(doc(db, 'id_reviews', userId), update, { merge: existed });
  return { frontPath, backPath, status: 'pending' };
}

/**
 * Fetch the caller's own id_review row — used by the ID gate screen
 * to show current status without going through the admin SDK.
 */
export async function fetchMyIdReview(userId) {
  if (!isFirebaseConfigured || !userId) return null;
  const snap = await getDoc(doc(db, 'id_reviews', userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Exec-only: list id_reviews, optionally filtered by status. Called
 * by ManageVerifications. Firestore rules allow full read for exec.
 */
export async function listIdReviews({ status = null } = {}) {
  if (!isFirebaseConfigured) return [];
  const parts = [collection(db, 'id_reviews')];
  if (status) parts.push(where('status', '==', status));
  const snap = await getDocs(parts.length === 1 ? parts[0] : query(parts[0], ...parts.slice(1)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Mint a short-lived signed URL for an ID file via the Cloud
 * Function callable. 5-minute expiry; owner or exec may call.
 */
export async function getIdViewUrl({ uid, kind = 'personal', side = 'front' }) {
  if (!isFirebaseConfigured) return null;
  try {
    const fn = httpsCallable(getFunctions(), 'getIdViewUrl');
    const res = await fn({ uid, kind, side });
    return res?.data?.url || null;
  } catch (e) {
    console.warn('getIdViewUrl failed', uid, kind, side, e?.message);
    return null;
  }
}

/**
 * Exec-only transition. Rules permit exec to set status to
 * approved/rejected; the sync trigger mirrors it to
 * /users.verification_status.
 */
export async function setIdReviewStatus(uid, status, reviewerUid) {
  if (!isFirebaseConfigured || !uid) return;
  if (!['approved', 'rejected', 'pending'].includes(status)) throw new Error('Invalid status');
  await setDoc(doc(db, 'id_reviews', uid), {
    status,
    reviewed_at: serverTimestamp(),
    reviewed_by: reviewerUid || null,
  }, { merge: true });
}
