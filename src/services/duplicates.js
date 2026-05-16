// Duplicate-account checks beyond what Firebase Auth handles natively.
//
// Firebase already guarantees email uniqueness on the auth side (we wrap
// that in authFirebase.emailAlreadyRegistered). This file adds the
// secondary checks we care about on the Firestore side:
//   - phone numbers, normalized to digits-only, so "(555) 123-4567"
//     and "+1-555-123-4567" collide
//
// Why not name? Names aren't unique by design (Satvik Koya could be two
// different people). Blocking by name would lock out legitimate signups
// and is not enforced.
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

// Normalize a phone string to a comparable digits-only form. We keep the
// US-friendly trailing 10 so "+1 (555) 123-4567" → "5551234567".
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

export async function phoneAlreadyRegistered(rawPhone) {
  if (!isFirebaseConfigured) return false;
  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) return false;
  try {
    // We store phone in the `phone` field — query both raw input and
    // normalized form so old docs still match.
    const q = query(
      collection(db, 'users'),
      where('phone_normalized', '==', phone),
      limit(1),
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (e) {
    console.warn('phoneAlreadyRegistered failed', e);
    return false;
  }
}

// Helper that signUp() should call so every new user gets a
// phone_normalized field, making the duplicate check actually fire
// (otherwise old docs with unnormalized "phone" wouldn't match).
export function withNormalizedPhone(userDoc) {
  return {
    ...userDoc,
    phone_normalized: normalizePhone(userDoc.phone),
  };
}
