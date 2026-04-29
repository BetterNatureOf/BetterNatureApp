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
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, isFirebaseConfigured } from '../config/firebase';
import { generateReferralCode, applyReferral, readPendingReferralCode } from './referrals';

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

export async function signUp({ email, password, name, phone, city, zip, role, referralCode }) {
  if (!isFirebaseConfigured) {
    const user = makeMockUser({ email, name, phone, city, zip, role });
    return { user, session: { user } };
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await fbUpdateProfile(cred.user, { displayName: name });

  // Mirror Supabase's handle_new_user() trigger: create the users/{uid} doc.
  const userDoc = {
    id: cred.user.uid,
    email,
    name: name || '',
    phone: phone || '',
    city: city || '',
    zip: zip || '',
    role: role || 'member',
    chapter_id: null,
    events_attended: 0,
    hours_logged: 0,
    meals_rescued: 0,
    // Email signup collects everything we need, so they're complete on creation.
    profile_complete: true,
    referral_code: generateReferralCode(),
    referrals_count: 0,
    referred_by: null,
    created_at: serverTimestamp(),
  };
  await setDoc(doc(db, 'users', cred.user.uid), userDoc);

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

  // OAuth users may have arrived via a /?ref= link — attribute now.
  const inviteCode = (readPendingReferralCode() || '').trim();
  if (inviteCode) {
    try { await applyReferral(fbUser.uid, inviteCode); } catch {}
  }
  return data;
}

// Sign in (or sign up) with Google. Web-only popup flow today; native
// will use expo-auth-session in a follow-up. `restrictDomain` rejects
// accounts outside a Google Workspace (used on the admin login).
// Friendly handler for "this email is already on a different provider".
// We don't auto-link silently (Firebase requires re-auth with the original
// method), but we tell the user *which* method to use so they don't end up
// with two separate accounts under the same email.
async function explainLinkingError(err) {
  if (err?.code !== 'auth/account-exists-with-different-credential') return err;
  try {
    const email = err.customData?.email;
    if (email) {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      const human = methods.map(m => (
        m === 'google.com' ? 'Google' :
        m === 'apple.com'  ? 'Apple' :
        m === 'password'   ? 'email + password' : m
      )).join(' or ');
      return new Error(
        `This email already has an account using ${human}. ` +
        `Sign in with ${human} first to keep everything in one account.`
      );
    }
  } catch {}
  return err;
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
export async function signInWithApple() {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  let cred;
  try { cred = await signInWithPopup(auth, provider); }
  catch (e) { throw await explainLinkingError(e); }
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
  await updateDoc(doc(db, 'users', userId), {
    ...updates,
    updated_at: serverTimestamp(),
  });
  return getProfile(userId);
}

export async function uploadIdDocument(userId, fileUri) {
  if (!isFirebaseConfigured) return fileUri;
  const fileName = `id-docs/${userId}-${Date.now()}.jpg`;
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(storageRef);

  await updateDoc(doc(db, 'users', userId), { id_document_url: url });
  return url;
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
