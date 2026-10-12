// A2 — read-only client to /public_profiles. The collection is
// minted exclusively by the syncPublicProfileOnWrite Cloud Function
// from an allowlist of fields on /users (see functions/syncPublicProfile.js).
//
// Call this instead of reading /users directly for ANY cross-user
// surface: leaderboard, event rosters, chapter directory, pickup
// claimant display, website visualizations. Reads of /users itself
// now fail for non-owners under the A2 rules (owner, exec, and
// same-chapter president only).
//
// Allowlisted fields on each row:
//   { uid, display_name, chapter_id, avatar_url, lbs_rescued,
//     hours_logged, events_attended, points, leaderboard_score,
//     pickups_dropped, meals_rescued, referral_code, role_label,
//     updated_at }

import {
  collection, doc, getDoc, getDocs, query, where, limit as fsLimit,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

const snapToList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export async function fetchPublicProfile(uid) {
  if (!isFirebaseConfigured || !uid) return null;
  try {
    const s = await getDoc(doc(db, 'public_profiles', uid));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  } catch (e) {
    console.warn('fetchPublicProfile failed', uid, e?.message);
    return null;
  }
}

// Hydrate many at once. In: array of uids. Out: Map(uid → profile).
// Firestore has no multi-get; we fire concurrent getDocs and
// de-duplicate. Missing uids are simply absent from the map.
export async function fetchPublicProfiles(uids = []) {
  if (!isFirebaseConfigured) return new Map();
  const uniq = [...new Set(uids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const out = new Map();
  await Promise.all(uniq.map(async (uid) => {
    const p = await fetchPublicProfile(uid);
    if (p) out.set(uid, p);
  }));
  return out;
}

// Full-table scan — only used from the leaderboard, which already
// paginates/limits in a wrapper. Public read, no PII.
export async function fetchAllPublicProfiles({ chapterId = null } = {}) {
  if (!isFirebaseConfigured) return [];
  try {
    let q = collection(db, 'public_profiles');
    if (chapterId) q = query(q, where('chapter_id', '==', chapterId));
    const snap = await getDocs(q);
    return snapToList(snap);
  } catch (e) {
    console.warn('fetchAllPublicProfiles failed', e?.message);
    return [];
  }
}

// Lookup a profile by its referral code. Used by signup to validate
// a code and credit the referrer; the referral_code field is part of
// the public allowlist by design.
export async function findProfileByReferralCode(code) {
  if (!isFirebaseConfigured || !code) return null;
  try {
    const q = query(
      collection(db, 'public_profiles'),
      where('referral_code', '==', code),
      fsLimit(1),
    );
    const snap = await getDocs(q);
    const first = snap.docs[0];
    return first ? { id: first.id, ...first.data() } : null;
  } catch (e) {
    console.warn('findProfileByReferralCode failed', e?.message);
    return null;
  }
}
