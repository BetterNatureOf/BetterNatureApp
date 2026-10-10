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

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
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
  const existing = await getDoc(doc(db, 'id_reviews', userId));
  const prior = existing.exists() ? existing.data() : {};
  const next = {
    ...prior,
    [`${map.front}_present`]: true,
    [`${map.front}_path`]:    frontPath,
    [`${map.back}_present`]:  true,
    [`${map.back}_path`]:     backPath,
    status: 'pending',
    uploaded_at: serverTimestamp(),
    reviewed_at: null,
    reviewed_by: null,
  };
  await setDoc(doc(db, 'id_reviews', userId), next, { merge: true });
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
