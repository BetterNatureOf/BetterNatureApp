// Firebase Auth wrapper — mirrors the API shape of the old Supabase auth.js
// so screens calling signIn/signUp/getProfile don't need changes.
//
// Profile data lives in Firestore `users/{uid}` (mirrors old Supabase users table).
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile as fbUpdateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  linkWithCredential,
  linkWithPopup,
  unlink,
  fetchSignInMethodsForEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword as fbUpdatePassword,
  sendPasswordResetEmail,
  deleteUser as fbDeleteUser,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, isFirebaseConfigured } from '../config/firebase';
import { generateReferralCode, applyReferral, readPendingReferralCode } from './referrals';
import { withNormalizedPhone } from './duplicates';
import { bumpOrgStats } from './orgStats';

function makeMockUser({ email, name, phone, city, zip, role }) {
  return {
    id: 'mock-user-1',
    email: email || 'demo@betternature.app',
    name: name || 'Demo User',
    phone: phone || '',
    city: city || '',
    zip: zip || '',
    role: role || 'member',
    chapter_id: 'ch-memphis',
  };
}

// Map Firebase's auth/* error codes to plain-English messages a user can
// actually act on. Anything we don't recognize falls through to the raw
// message so we still surface something useful.
function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/email-already-in-use') {
    return new Error(
      'That email is already registered. Try signing in instead, ' +
      'or use a different email.'
    );
  }
  if (code === 'auth/invalid-email')   return new Error('That email doesn’t look right. Check the spelling.');
  if (code === 'auth/weak-password')   return new Error('Password is too weak. Use at least 6 characters.');
  if (code === 'auth/network-request-failed') return new Error('No network — check your connection and try again.');
  if (code === 'auth/too-many-requests') return new Error('Too many attempts. Wait a minute and try again.');
  return err;
}

// Quick check for the signup form: returns true if a Firebase Auth user
// already exists for this email. Lets us warn on Step 1 (before the user
// fills out the rest of the form) instead of at Submit.
export async function emailAlreadyRegistered(email) {
  if (!isFirebaseConfigured || !email) return false;
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email.trim());
    return Array.isArray(methods) && methods.length > 0;
  } catch {
    // If the lookup itself errors (rate-limit, network), don't block
    // signup — Firebase will catch a true duplicate at create time.
    return false;
  }
}

export async function signUp({ email, password, name, phone, city, state, country, zip, role, referralCode }) {
  if (!isFirebaseConfigured) {
    const user = makeMockUser({ email, name, phone, city, zip, role });
    return { user, session: { user } };
  }

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    throw friendlyAuthError(e);
  }
  if (name) await fbUpdateProfile(cred.user, { displayName: name });

  // Mirror Supabase's handle_new_user() trigger: create the users/{uid} doc.
  const userDoc = {
    id: cred.user.uid,
    email,
    name: name || '',
    phone: phone || '',
    city: city || '',
    state: state || '',
    country: (country || 'USA').toUpperCase(),
    zip: zip || '',
    role: role || 'member',
    chapter_id: null,
    events_attended: 0,
    hours_logged: 0,
    meals_rescued: 0,
    // Email signup collects everything we need, so they're complete on creation.
    profile_complete: true,
    // Members start in 'pending' and only get full app access once
    // an exec approves them in Manage Members. Restaurants use a
    // separate restaurant_status; execs/presidents/admins seeded
    // outside this flow bypass via role check in MemberApprovalGate.
    member_status: (role || 'member') === 'member' ? 'pending' : 'approved',
    referral_code: generateReferralCode(),
    referrals_count: 0,
    referred_by: null,
    created_at: serverTimestamp(),
  };
  // Stamp the normalized phone alongside the raw value so the duplicate
  // check (services/duplicates.js → phoneAlreadyRegistered) can match
  // future signups against this row regardless of formatting.
  await setDoc(doc(db, 'users', cred.user.uid), withNormalizedPhone(userDoc));

  // Bump the org-wide volunteer counter so the homepage ticker reflects
  // the new signup. We only count actual member volunteers — partner /
  // restaurant accounts don't move this number. Best-effort: if the
  // org_stats write fails the user is still fully signed up.
  if ((userDoc.role || 'member') === 'member') {
    try { await bumpOrgStats({ volunteers: 1 }); } catch (e) { console.warn('volunteer bump', e); }
  }

  // Attribute the inviter if a code was supplied (form field or ?ref= URL).
  const inviteCode = (referralCode || readPendingReferralCode() || '').trim();
  if (inviteCode) {
    try { await applyReferral(cred.user.uid, inviteCode); } catch {}
  }

  return {
    user: userDoc,
    session: { user: cred.user },
  };
}

export async function signIn({ email, password }) {
  if (!isFirebaseConfigured) {
    const user = makeMockUser({ email });
    return { user, session: { user } };
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await getProfile(cred.user.uid);
  return {
    user: profile || { id: cred.user.uid, email: cred.user.email },
    session: { user: cred.user },
  };
}

export async function signOut() {
  if (!isFirebaseConfigured) return;
  await fbSignOut(auth);
}

// Web-side roles (super_admin, admin, volunteer, partner, member) need to map
// onto the app's internal role names (executive, chapter_president, member,
// restaurant) so navigation gates work the same across both surfaces.
function normalizeRole(rawRole) {
  if (rawRole === 'super_admin' || rawRole === 'admin') return 'executive';
  if (rawRole === 'partner') return 'restaurant';
  if (rawRole === 'volunteer') return 'member';
  return rawRole || 'member';
}

export async function getProfile(userId) {
  if (!isFirebaseConfigured) return makeMockUser({});
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { id: snap.id, ...data, role: normalizeRole(data.role) };
}

// Bootstraps a users/{uid} doc the first time a social sign-in lands.
// Shared between Google and Apple flows so the schema stays consistent.
async function bootstrapSocialUser(fbUser) {
  const ref = doc(db, 'users', fbUser.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return existing.data();
  const isSuper = (fbUser.email || '').toLowerCase() === 'satvik.koya@betternatureofficial.org';
  const data = {
    id: fbUser.uid,
    email: fbUser.email || '',
    name: fbUser.displayName || '',
    first_name: '',
    last_name: '',
    phone: '',
    city: '',
    state: '',
    zip: '',
    role: isSuper ? 'super_admin' : 'member',
    chapter_id: null,
    events_attended: 0,
    hours_logged: 0,
    meals_rescued: 0,
    // Social sign-up skips our email form, so mark the profile incomplete
    // and the app routes them to CompleteProfile to collect first/last
    // name, phone, and location.
    profile_complete: !!isSuper,
    referral_code: generateReferralCode(),
    referrals_count: 0,
    referred_by: null,
    created_at: serverTimestamp(),
  };
  await setDoc(ref, data);

  // Bump the org-wide volunteer counter on first OAuth sign-in. Skip
  // super_admins (they're org staff, not volunteers). Best-effort.
  if (data.role === 'member') {
    try { await bumpOrgStats({ volunteers: 1 }); } catch (e) { console.warn('volunteer bump (oauth)', e); }
  }

  // OAuth users may have arrived via a /?ref= link — attribute now.
  const inviteCode = (readPendingReferralCode() || '').trim();
  if (inviteCode) {
    try { await applyReferral(fbUser.uid, inviteCode); } catch {}
  }
  return data;
}

// When Firebase throws auth/account-exists-with-different-credential it
// gives us both the existing-account email AND the unused new credential
// (Google/Apple). To auto-link instead of stranding the user, we have to
// (1) sign them in with the *original* provider, then (2) call
// linkWithCredential to attach the new one.
//
// Because we can't re-auth silently, this helper resolves to a structured
// object that the UI uses to prompt the user once and then complete the
// link without making them remember "which button I clicked last time."
async function describeLinkingError(err) {
  if (err?.code !== 'auth/account-exists-with-different-credential') return null;
  try {
    const email = err.customData?.email;
    if (!email) return null;
    const methods = await fetchSignInMethodsForEmail(auth, email);
    const pending =
      err?.credential ||
      GoogleAuthProvider.credentialFromError?.(err) ||
      OAuthProvider.credentialFromError?.(err);
    return {
      email,
      methods,        // e.g. ['password'] or ['google.com']
      pending,        // credential to .link() onto the eventual current user
      human: methods.map(m => (
        m === 'google.com' ? 'Google' :
        m === 'apple.com'  ? 'Apple' :
        m === 'password'   ? 'email + password' : m
      )).join(' or '),
    };
  } catch {}
  return null;
}

// Back-compat: wraps describeLinkingError into the old "throw friendly
// Error" shape so existing call sites that just rethrow still work.
async function explainLinkingError(err) {
  const info = await describeLinkingError(err);
  if (!info) return err;
  const e = new Error(
    `This email already has an account using ${info.human}. ` +
    `Sign in with ${info.human} first to link your accounts.`
  );
  e.linking = info;
  e.code = 'auth/account-exists-with-different-credential';
  return e;
}

// Public API: complete the link after the user has signed in with the
// provider that already owned the email. Call from the UI after a
// successful password / Google / Apple signin if you held onto the
// `pending` credential from the original failure.
export async function linkPendingCredential(pendingCredential) {
  if (!auth.currentUser) throw new Error('Sign in first, then link.');
  if (!pendingCredential) throw new Error('No pending credential to link.');
  await linkWithCredential(auth.currentUser, pendingCredential);
}

export async function signInWithGoogle({ restrictDomain } = {}) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const provider = new GoogleAuthProvider();
  if (restrictDomain) provider.setCustomParameters({ hd: restrictDomain });
  let cred;
  try { cred = await signInWithPopup(auth, provider); }
  catch (e) { throw await explainLinkingError(e); }
  if (restrictDomain && !cred.user.email?.toLowerCase().endsWith(`@${restrictDomain.toLowerCase()}`)) {
    await fbSignOut(auth);
    throw new Error(`Use a @${restrictDomain} Google account.`);
  }
  await bootstrapSocialUser(cred.user);
  const profile = await getProfile(cred.user.uid);
  return { user: profile, session: { user: cred.user } };
}

// Sign in (or sign up) with Apple. Requires Apple Developer Program
// enrollment, a Services ID configured for Sign in with Apple, and the
// Apple provider enabled in Firebase → Authentication → Sign-in method.
// Returns the same shape as signInWithGoogle so callers don't branch.
// Map Apple-specific failure codes to messages that tell us (or the
// user) exactly what to do. The most common ones at launch:
//   - operation-not-allowed     → Apple provider isn't enabled in Firebase
//                                 Console → Authentication → Sign-in method
//   - popup-blocked            → browser blocked the OAuth popup
//   - popup-closed-by-user     → user dismissed the sheet
//   - unauthorized-domain      → app.betternatureofficial.org isn't in
//                                 Firebase auth's Authorized domains list
function explainAppleError(err) {
  const code = err?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return new Error(
      'Apple sign-in isn’t enabled yet. Admin: turn it on in Firebase Console → ' +
      'Authentication → Sign-in method → Apple. Requires an Apple Developer ' +
      'Services ID (Apple Developer Program, $99/yr).'
    );
  }
  if (code === 'auth/popup-blocked') {
    return new Error('Browser blocked the Apple sign-in popup. Allow popups for this site and try again.');
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error('Sign-in window closed before you finished.');
  }
  if (code === 'auth/unauthorized-domain') {
    return new Error(
      'This domain isn’t authorized for Apple sign-in. Admin: add it under Firebase Console → ' +
      'Authentication → Settings → Authorized domains.'
    );
  }
  return err;
}

export async function signInWithApple() {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  let cred;
  try { cred = await signInWithPopup(auth, provider); }
  catch (e) {
    // Cross-provider linking still wins if Firebase says the email is
    // already on a different sign-in method; otherwise fall through to
    // our Apple-specific explainer so the admin sees a clear next step.
    if (e?.code === 'auth/account-exists-with-different-credential') {
      throw await explainLinkingError(e);
    }
    throw explainAppleError(e);
  }
  // Apple only sends the displayName on first sign-in. Capture it here
  // so the CompleteProfile screen can pre-split it into first/last.
  if (cred.user && !cred.user.displayName) {
    const oauth = OAuthProvider.credentialFromResult(cred);
    const fullName = oauth?.fullName || '';
    if (fullName) {
      try { await fbUpdateProfile(cred.user, { displayName: fullName }); } catch {}
    }
  }
  await bootstrapSocialUser(cred.user);
  const profile = await getProfile(cred.user.uid);
  return { user: profile, session: { user: cred.user } };
}

export async function updateProfile(userId, updates) {
  if (!isFirebaseConfigured) return { ...makeMockUser({}), ...updates };
  // If the caller is updating `phone`, also update `phone_normalized` so
  // the duplicate-phone lookup keeps working after edits.
  const payload = { ...updates, updated_at: serverTimestamp() };
  if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
    payload.phone_normalized = withNormalizedPhone({ phone: updates.phone }).phone_normalized;
  }
  await updateDoc(doc(db, 'users', userId), payload);
  return getProfile(userId);
}

// Upload a single ID image to Firebase Storage. Returns the download
// URL. Used by both the personal-ID flow (VerifyIdScreen) and the
// driver's-license flow (DriverSetup) — the caller decides which side
// it is and stamps the resulting URL on the appropriate user-doc field.
//
// We tag the storage path with a `kind` segment so admins can browse
// the bucket organized by purpose ("id-docs/personal/..." vs.
// "id-docs/driver/..."), and with a `side` segment so front and back
// don't collide.
export async function uploadIdImage(userId, fileUri, { kind = 'personal', side = 'front' } = {}) {
  if (!isFirebaseConfigured) return fileUri;
  const fileName = `id-docs/${kind}/${userId}-${side}-${Date.now()}.jpg`;
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}

// Personal ID — upload front + back and stamp both URLs on the user
// doc. Sets verification_status to 'pending' so the upload shows up in
// Admin → Verify IDs for review. Keeps the legacy `id_document_url`
// field pointing at the front so older code that reads it (e.g. the
// ID gate, the admin list thumbnail) keeps working.
export async function uploadIdDocument(userId, { frontUri, backUri }) {
  if (!isFirebaseConfigured) return null;
  if (!frontUri) throw new Error('Front of the ID is required.');
  if (!backUri)  throw new Error('Back of the ID is required.');

  const [frontUrl, backUrl] = await Promise.all([
    uploadIdImage(userId, frontUri, { kind: 'personal', side: 'front' }),
    uploadIdImage(userId, backUri,  { kind: 'personal', side: 'back' }),
  ]);

  await updateDoc(doc(db, 'users', userId), {
    id_document_url: frontUrl,            // legacy field — points at front
    id_document_front_url: frontUrl,
    id_document_back_url: backUrl,
    verification_status: 'pending',
    verification_reviewed_at: null,
  });
  return { frontUrl, backUrl };
}

// Re-authenticate with the current password (Firebase requires this before
// any sensitive change like updating the password) and then set a new one.
// Throws an Error with a friendly message on common failure modes.
export async function changePassword(currentPassword, newPassword) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const user = auth.currentUser;
  if (!user) throw new Error('You are signed out. Sign in again to continue.');
  if (!user.email) throw new Error('Your account does not use a password (Google or Apple sign-in).');
  if (!currentPassword) throw new Error('Enter your current password.');
  if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters.');
  try {
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await fbUpdatePassword(user, newPassword);
  } catch (e) {
    if (e?.code === 'auth/wrong-password' || e?.code === 'auth/invalid-credential')
      throw new Error('Current password is incorrect.');
    if (e?.code === 'auth/weak-password')
      throw new Error('That password is too weak. Try at least 6 characters.');
    if (e?.code === 'auth/requires-recent-login')
      throw new Error('Please sign out and sign back in, then try again.');
    throw new Error(e.message || 'Could not update password.');
  }
}

// One-tap "send me a reset email" — used for OAuth users or when the user
// forgot their current password.
export async function sendResetEmail(email) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  if (!email) throw new Error('Enter your email.');
  await sendPasswordResetEmail(auth, email);
}

// Hard delete: nukes the Firestore profile + the Firebase Auth user.
// Caller is responsible for the two-step "are you sure" UX. We mark the
// doc deleted_at first so any concurrent reads (analytics, audit) see
// the tombstone even if the auth delete fails mid-flight and we have
// to retry. Auth delete needs a recent sign-in — if it errors with
// `requires-recent-login`, caller should re-prompt for password and retry.
export async function deleteAccount() {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const fb = auth.currentUser;
  if (!fb) throw new Error('Not signed in.');
  const uid = fb.uid;
  // Tombstone the profile doc first so downstream reads stop returning it.
  try { await updateDoc(doc(db, 'users', uid), { deleted_at: serverTimestamp(), name: 'Deleted user', email: null, phone: null }); } catch {}
  // Best-effort actual delete of the profile doc.
  try { await deleteDoc(doc(db, 'users', uid)); } catch {}
  // Finally, delete the auth user. If this throws requires-recent-login,
  // the caller should reauth and call again.
  await fbDeleteUser(fb);
}

// ── Proactive account linking ───────────────────────────────────────
//
// These power the Settings → Connected accounts panel. Users can
// connect Google to an existing email/password account (so they can
// sign in either way) or set a password on a Google-only account.
//
// Distinct from the reactive flow in linkPendingCredential() above,
// which only fires when a user tries to OAuth into an email that
// already exists with another provider.

// Returns the providerIds currently linked to the signed-in user.
// e.g. ['password', 'google.com', 'apple.com']
export function getLinkedProviders() {
  if (!isFirebaseConfigured) return [];
  const fb = auth.currentUser;
  if (!fb) return [];
  return (fb.providerData || []).map((p) => p.providerId);
}

// Link Google to the current user via popup. The current user keeps
// the same uid + Firestore doc; we just add Google as an additional
// sign-in method. Surfaces a friendly error if the Google account is
// already attached to a different BetterNature account.
export async function linkGoogleToCurrentUser() {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const fb = auth.currentUser;
  if (!fb) throw new Error('Sign in first.');
  if ((fb.providerData || []).some((p) => p.providerId === 'google.com')) {
    throw new Error('Google is already connected to this account.');
  }
  try {
    await linkWithPopup(fb, new GoogleAuthProvider());
  } catch (e) {
    if (e?.code === 'auth/credential-already-in-use') {
      throw new Error('That Google account is already used by another BetterNature user.');
    }
    if (e?.code === 'auth/popup-blocked') {
      throw new Error('Browser blocked the popup. Allow popups for this site and try again.');
    }
    if (e?.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in window closed before you finished.');
    }
    throw e;
  }
}

// Same for Apple — disabled until FEATURES.APPLE_SIGNIN is true and
// the Apple provider is enabled in Firebase Console.
export async function linkAppleToCurrentUser() {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const fb = auth.currentUser;
  if (!fb) throw new Error('Sign in first.');
  if ((fb.providerData || []).some((p) => p.providerId === 'apple.com')) {
    throw new Error('Apple is already connected to this account.');
  }
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  try { await linkWithPopup(fb, provider); }
  catch (e) {
    if (e?.code === 'auth/operation-not-allowed') {
      throw new Error('Apple sign-in isn’t enabled yet. Ask an admin to turn it on.');
    }
    if (e?.code === 'auth/credential-already-in-use') {
      throw new Error('That Apple ID is already used by another BetterNature user.');
    }
    throw e;
  }
}

// Drop a provider from the current user's sign-in methods. Refuses to
// remove the last method (you'd lock yourself out otherwise).
export async function unlinkProvider(providerId) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const fb = auth.currentUser;
  if (!fb) throw new Error('Sign in first.');
  const current = (fb.providerData || []).map((p) => p.providerId);
  if (current.length <= 1) {
    throw new Error('Can’t disconnect your only sign-in method.');
  }
  if (!current.includes(providerId)) {
    throw new Error('That provider isn’t connected.');
  }
  await unlink(fb, providerId);
}

// Set a password on an account that was created via OAuth. Useful when
// a user originally signed in with Google but wants an email/password
// fallback. Mirrors changePassword() but for the case where there's no
// existing password to re-auth against.
export async function setPasswordOnCurrentUser(newPassword) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const fb = auth.currentUser;
  if (!fb) throw new Error('Sign in first.');
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if ((fb.providerData || []).some((p) => p.providerId === 'password')) {
    throw new Error('You already have a password — use Change Password instead.');
  }
  if (!fb.email) {
    throw new Error('Your account doesn’t have an email on file. Contact support.');
  }
  // Build a password credential and link it.
  const cred = EmailAuthProvider.credential(fb.email, newPassword);
  try { await linkWithCredential(fb, cred); }
  catch (e) {
    if (e?.code === 'auth/weak-password') {
      throw new Error('Pick a stronger password (at least 6 characters).');
    }
    if (e?.code === 'auth/requires-recent-login') {
      throw new Error('For security, sign out and back in, then try again.');
    }
    throw e;
  }
}

// Mirrors Supabase's onAuthStateChange contract.
// Returns { data: { subscription: { unsubscribe } } } so callers don't change.
export function onAuthStateChange(callback) {
  if (!isFirebaseConfigured) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
    callback(fbUser ? { user: fbUser } : null);
  });
  return { data: { subscription: { unsubscribe } } };
}
