// Founder bootstrap — addresses the chicken-and-egg problem where
// the Firestore rules require role === 'executive' to write to
// /chapters, but a fresh email signup defaults to role === 'member'.
//
// Any email in FOUNDER_EMAILS gets auto-upgraded to 'executive' the
// next time the app reads their profile. Self-write is allowed by
// the rules (`allow update: if isSelf(uid)`), so the user doesn't
// need exec privileges to perform the upgrade — they just need to
// be signed in as themselves.
//
// After launch this list will live in env / Firestore config; for
// now it's hard-coded so the org founders can manage chapters on
// day one without us shipping yet another migration.
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

const FOUNDER_EMAILS = [
  'satvik.koya@betternatureofficial.org',
  'info@betternatureofficial.org',
].map((e) => e.toLowerCase());

// Domain match — any @betternatureofficial.org address counts as a
// founder during the launch window. After the team is fully seeded
// we'll tighten this to the explicit list above and drop the domain
// check. Keeps the bootstrap robust against the founder using a
// different alias (info-, hello-, etc.) than the two hard-coded ones.
const FOUNDER_DOMAINS = ['betternatureofficial.org'];

export function isFounderEmail(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (FOUNDER_EMAILS.includes(e)) return true;
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  return FOUNDER_DOMAINS.includes(domain);
}

// Force-write role:'executive' onto the signed-in user's profile.
// Called from the visible 'Become executive' button in Settings as
// the manual escape hatch when ensureFounderRole couldn't kick in
// (e.g. the user signed up with an email outside the founder list).
// Firestore's `allow update: if isSelf(uid)` rule means this works
// for the user themselves without any prior exec privilege.
export async function selfPromoteToExecutive(uid) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  if (!uid) throw new Error('Not signed in');
  await updateDoc(doc(db, 'users', uid), {
    role: 'executive',
    member_status: 'approved',
    promoted_at: serverTimestamp(),
    promoted_reason: 'self-promote launch',
  });
}

// Reads the user doc and, if the email is in the founder list AND
// the doc's role isn't already executive/super_admin/admin, writes
// role:'executive' onto their profile. No-op otherwise. Always safe
// to call.
export async function ensureFounderRole(authUserOrProfile) {
  if (!isFirebaseConfigured) return authUserOrProfile;
  const uid = authUserOrProfile?.uid || authUserOrProfile?.id;
  const email = (authUserOrProfile?.email || '').toLowerCase();
  if (!uid || !email || !isFounderEmail(email)) return authUserOrProfile;

  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return authUserOrProfile;
    const data = snap.data();
    const role = (data.role || '').toLowerCase();
    const okRoles = new Set(['executive', 'admin', 'super_admin']);
    if (okRoles.has(role)) return { id: uid, ...data };
    await updateDoc(ref, {
      role: 'executive',
      member_status: 'approved',
      promoted_at: serverTimestamp(),
      promoted_reason: 'founder bootstrap',
    });
    return { id: uid, ...data, role: 'executive', member_status: 'approved' };
  } catch (e) {
    // Non-fatal — login still works, the user just can't write to
    // protected collections until this resolves. Log so we can debug
    // if the network was flaky.
    console.warn('ensureFounderRole skipped', e);
    return authUserOrProfile;
  }
}
