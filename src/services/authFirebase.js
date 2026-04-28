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

export async function signUp({ email, password, name, phone, city, zip, role }) {
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
    created_at: serverTimestamp(),
  };
  await setDoc(doc(db, 'users', cred.user.uid), userDoc);

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
    created_at: serverTimestamp(),
  };
  await setDoc(ref, data);
  return data;
}

// Sign in (or sign up) with Google. Web-only popup flow today; native
// will use expo-auth-session in a follow-up. `restrictDomain` rejects
// accounts outside a Google Workspace (used on the admin login).
export async function signInWithGoogle({ restrictDomain } = {}) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const provider = new GoogleAuthProvider();
  if (restrictDomain) provider.setCustomParameters({ hd: restrictDomain });
  const cred = await signInWithPopup(auth, provider);
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
  const cred = await signInWithPopup(auth, provider);
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
