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

// Save the structured driver setup block. Lives at users/{uid}.driver
// so the gate (and admin verification screen) can read it without
// touching unrelated profile fields.
export async function saveDriverSetup(uid, {
  type,
  licenseUrl,             // back-compat: equals front URL
  licenseFrontUrl,
  licenseBackUrl,
  holderName,
  holderRelationship,
  holderPhone,
  consentSignedName,
}) {
  if (!isFirebaseConfigured || !uid) return;
  await updateDoc(doc(db, 'users', uid), {
    driver: {
      type,                                                  // 'self' | 'other'
      license_url: licenseUrl || licenseFrontUrl,            // legacy single thumbnail
      license_front_url: licenseFrontUrl || licenseUrl || null,
      license_back_url: licenseBackUrl || null,
      holder_name: holderName || '',
      holder_relationship: holderRelationship || '',
      holder_phone: holderPhone || '',
      consent_signed: type === 'other' ? !!consentSignedName : null,
      consent_signed_name: type === 'other' ? consentSignedName : null,
      consent_signed_at: type === 'other' ? new Date().toISOString() : null,
      reviewed_status: 'pending',                            // admin flips later
    },
    driver_setup_complete: true,
  });
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
