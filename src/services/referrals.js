// Referral codes — every user gets a short code on signup. Sharing the
// code (or a /?ref=CODE link) and having the new account land in the app
// bumps the inviter's referrals_count, which feeds leaderboards and
// "your impact" totals later.
//
// Storage:
//   users/{uid}.referral_code   — short uppercase code (e.g. "BN7Q9X4K")
//   users/{uid}.referrals_count — incremented when someone signs up with their code
//   users/{uid}.referred_by     — the inviter's uid, set once on the new user
import {
  collection, doc, getDoc, getDocs, query, where, limit,
  setDoc, updateDoc, increment, serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function generateReferralCode(len = 7) {
  let s = 'BN';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// Build a shareable link. Marketing site picks ?ref=CODE up on first load
// and persists it to localStorage so it survives the round trip into signup.
export function referralLink(code) {
  return `https://betternatureofficial.org/?ref=${encodeURIComponent(code || '')}`;
}

// Look up the user that owns a given code. Returns null if not found.
export async function findUserByReferralCode(code) {
  if (!isFirebaseConfigured || !code) return null;
  const q = query(
    collection(db, 'users'),
    where('referral_code', '==', String(code).trim().toUpperCase()),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// Backfill — used when an existing account doesn't have a code yet.
export async function ensureReferralCode(userId) {
  if (!isFirebaseConfigured || !userId) return null;
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.referral_code) return data.referral_code;
  // Tiny retry loop in case of collision.
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    const conflict = await findUserByReferralCode(code);
    if (conflict) continue;
    await updateDoc(ref, { referral_code: code });
    return code;
  }
  return null;
}

// Called from signup flows after the new user's profile is written.
// Idempotent — safe to call multiple times; only the first call attributes.
export async function applyReferral(newUserId, code) {
  if (!isFirebaseConfigured || !newUserId || !code) return { ok: false };
  const inviter = await findUserByReferralCode(code);
  if (!inviter || inviter.id === newUserId) return { ok: false };

  const newRef = doc(db, 'users', newUserId);
  const newSnap = await getDoc(newRef);
  if (newSnap.exists() && newSnap.data().referred_by) return { ok: false };

  await updateDoc(newRef, { referred_by: inviter.id });
  await updateDoc(doc(db, 'users', inviter.id), {
    referrals_count: increment(1),
    referrals_updated_at: serverTimestamp(),
  });
  return { ok: true, inviterId: inviter.id };
}

export async function getReferralStats(userId) {
  if (!isFirebaseConfigured || !userId) return { code: null, count: 0 };
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return { code: null, count: 0 };
  const d = snap.data();
  return { code: d.referral_code || null, count: d.referrals_count || 0 };
}

// Read a ref code from URL (?ref=) on web, or fall back to localStorage.
// Marketing site stashes it on first visit so it survives signup nav.
export function readPendingReferralCode() {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('ref');
    if (fromUrl) {
      window.localStorage?.setItem('bn_ref', fromUrl);
      return fromUrl.trim().toUpperCase();
    }
    const stored = window.localStorage?.getItem('bn_ref');
    return stored ? stored.trim().toUpperCase() : null;
  } catch { return null; }
}

export function clearPendingReferralCode() {
  if (typeof window === 'undefined') return;
  try { window.localStorage?.removeItem('bn_ref'); } catch {}
}
