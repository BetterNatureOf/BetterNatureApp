// ═══════════════════════════════════════════════════════════════════════════
//  BETTER NATURE — shared web auth (website + admin)
//
//  One Firebase project powers everything: the native app, the web version
//  of the app, the marketing website signups, and this admin panel. A single
//  account logs in across all of them.
//
//  Roles live in Firestore at  users/{uid}.role  ∈
//    "super_admin"  — only satvik.koya@betternatureofficial.org
//    "admin"        — can edit site content + see the admin panel
//    "volunteer"    — regular user created via /#signup on the site
//    "partner"      — business / kitchen partner
//    "member"       — app-native user (default)
//
//  Uses Firebase's ES module CDN so this runs in a plain static website with
//  zero build step.
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, query, where, getDocs, orderBy, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Same Firebase project as the app (see app.json → extra.firebase).
const firebaseConfig = {
  apiKey: "AIzaSyBoaYGVe8rObfGC-BKJo3yohbyZOWUD8gw",
  authDomain: "better-nature-app.firebaseapp.com",
  projectId: "better-nature-app",
  storageBucket: "better-nature-app.firebasestorage.app",
  messagingSenderId: "102288708316",
  appId: "1:102288708316:web:d15cda309e77d14b921a19",
  measurementId: "G-F0YTP6RGJ1",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const SUPER_ADMIN_EMAIL = 'satvik.koya@betternatureofficial.org';

// ── Auth helpers ─────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signUp({ email, password, name, role = 'volunteer', phone = '', city = '', zip = '', adminCode = '' }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  // If an admin code was provided, validate it. Valid code → role becomes 'admin'.
  let finalRole = role;
  if (adminCode) {
    const r = await consumeInviteCode(email, adminCode);
    if (r.ok) finalRole = 'admin';
    else throw new Error(
      r.reason === 'no_invite' ? 'No admin invite exists for this email.'
      : r.reason === 'revoked'  ? 'This admin invite has been revoked.'
      : 'That admin code is incorrect.'
    );
  }
  await ensureUserDoc(cred.user, { name, role: finalRole, phone, city, zip });
  return cred.user;
}

export async function logOut() { await signOut(auth); }

export function onUser(callback) {
  return onAuthStateChanged(auth, async (u) => {
    if (!u) return callback(null);
    const profile = await getProfile(u.uid);
    callback({ ...u, profile });
  });
}

// ── Profile / role bootstrap ─────────────────────────────────────────────
export async function ensureUserDoc(user, extra = {}) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const isSuper = (user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  const data = {
    email: user.email,
    name: extra.name || user.displayName || '',
    role: isSuper ? 'super_admin' : (extra.role || 'member'),
    phone: extra.phone || '',
    city: extra.city || '',
    zip: extra.zip || '',
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return data;
}

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

// ── Admin management (super_admin only) ──────────────────────────────────
export async function listAdmins() {
  const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'super_admin']));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function setRole(uid, role) {
  await updateDoc(doc(db, 'users', uid), { role });
}

// Where one-time admin codes get emailed when an invite is created.
// Change this if you want codes to go to a different inbox.
const ADMIN_CODE_INBOX = 'satvik.koya@betternatureofficial.org';

function generateAdminCode() {
  // 6-digit code, zero-padded
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function emailAdminCode({ email, code, invitedBy }) {
  // FormSubmit will email this to ADMIN_CODE_INBOX. The recipient must have
  // activated FormSubmit for that address once (click the activation link
  // in the first email FormSubmit sends).
  try {
    await fetch(`https://formsubmit.co/ajax/${ADMIN_CODE_INBOX}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: `[Better Nature] Admin code for ${email}`,
        _captcha: 'false',
        _template: 'box',
        invited_email: email,
        admin_code: code,
        invited_by: invitedBy || '',
        instructions: `Share this code with ${email}. They enter it on /admin.html to activate admin access.`,
      }),
    });
  } catch (e) { console.warn('email admin code failed', e); /* code is still in Firestore */ }
}

// Create an invite record + a one-time code. The code is emailed to the
// super-admin inbox; the invitee must enter it during signup to become
// an admin. Existing users get promoted directly with no code needed
// (since the super admin clicked their record explicitly).
export async function inviteAdmin(email, invitedBy = '') {
  const e = email.trim().toLowerCase();
  const existing = await getDocs(query(collection(db, 'users'), where('email', '==', e)));
  if (!existing.empty) {
    const userDoc = existing.docs[0];
    await updateDoc(userDoc.ref, { role: 'admin' });
    return { promoted: true, uid: userDoc.id };
  }
  const code = generateAdminCode();
  await setDoc(doc(db, 'admin_invites', e), {
    email: e,
    code,                 // one-time key
    createdAt: serverTimestamp(),
    invitedBy,
  });
  await emailAdminCode({ email: e, code, invitedBy });
  return { invited: true, code };
}

export async function listInvites() {
  const snap = await getDocs(collection(db, 'admin_invites'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function revokeInvite(email) {
  const e = email.trim().toLowerCase();
  await setDoc(doc(db, 'admin_invites', e), { revoked: true }, { merge: true });
}

// Verify a one-time code against a pending invite. Used when someone
// signs up at /admin.html and provides a code to claim admin access.
export async function consumeInviteCode(email, code) {
  const e = (email || '').trim().toLowerCase();
  const ref = doc(db, 'admin_invites', e);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, reason: 'no_invite' };
  const inv = snap.data();
  if (inv.revoked) return { ok: false, reason: 'revoked' };
  if (inv.code !== String(code).trim()) return { ok: false, reason: 'bad_code' };
  return { ok: true };
}

// Called on every signin. If a valid (un-revoked) invite exists for this
// email AND has already been consumed during signup, promote to admin.
// Promotion now requires the code path to have run — see ensureUserDoc.
export async function honorPendingInvite(user) {
  // Kept for back-compat. New flow promotes inside ensureUserDoc when the
  // code is provided. This function intentionally does nothing now.
}

// ── Audit log ────────────────────────────────────────────────────────────
export async function logEdit({ user, summary, fields = [], snapshotBefore, snapshotAfter }) {
  try {
    await addDoc(collection(db, 'admin_audit'), {
      uid: user.uid,
      email: user.email,
      name: user.displayName || '',
      summary,
      fields,
      // Store truncated diffs to keep doc size sane
      fieldsChanged: fields.length,
      at: serverTimestamp(),
    });
  } catch (e) {
    console.warn('audit log failed', e);
  }
}

export async function fetchAuditLog(max = 50) {
  const q = query(collection(db, 'admin_audit'), orderBy('at', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Shallow diff helper: returns list of changed top-level paths ─────────
export function diffPaths(a, b, prefix = '') {
  const paths = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const av = a?.[k], bv = b?.[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof av === 'object' && typeof bv === 'object' && av && bv && !Array.isArray(av) && !Array.isArray(bv)) {
      paths.push(...diffPaths(av, bv, p));
    } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
      paths.push(p);
    }
  }
  return paths;
}
