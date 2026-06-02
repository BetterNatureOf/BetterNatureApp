// ID verification status + waiver write helpers.
//
// verification_status on users/{uid} is one of:
//   'pending'  → uploaded, awaiting admin review
//   'approved' → admin reviewed + green-lit; ID gate lets them claim
//   'rejected' → admin rejected; user must re-upload
//
// The ID gate (services/idGate) treats anything that isn't 'approved'
// as "still verifying" so a stale pending row can't sneak through.
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

export async function setVerificationStatus(uid, status) {
  if (!isFirebaseConfigured || !uid) return;
  const updates = {
    verification_status: status,
    verification_reviewed_at: serverTimestamp(),
  };
  await updateDoc(doc(db, 'users', uid), updates);
}

// Save the signed waiver record onto the user doc. `signedName` is
// what the volunteer typed in as their legal signature.
export async function saveSignedWaiver(uid, { signedName, version = 1 }) {
  if (!isFirebaseConfigured || !uid) return;
  if (!signedName || !signedName.trim()) throw new Error('Type your full name to sign.');
  await updateDoc(doc(db, 'users', uid), {
    waiver_signed: true,
    waiver_signed_name: signedName.trim(),
    waiver_signed_at: serverTimestamp(),
    waiver_version: version,
  });
}
