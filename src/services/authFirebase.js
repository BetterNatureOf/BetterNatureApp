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

// Sign in with Google (web only — for native we'll use expo-auth-session).
// Optional `restrictDomain` (e.g. "betternatureofficial.org") rejects accounts
// outside the workspace.
export async function signInWithGoogle({ restrictDomain } = {}) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const provider = new GoogleAuthProvider();
  if (restrictDomain) provider.setCustomParameters({ hd: restrictDomain });
  const cred = await signInWithPopup(auth, provider);
  if (restrictDomain && !cred.user.email?.toLowerCase().endsWith(`@${restrictDomain.toLowerCase()}`)) {
    await fbSignOut(auth);
    throw new Error(`Use a @${restrictDomain} Google account.`);
  }
  // Bootstrap a users/{uid} doc on first Google sign-in.
  const ref = doc(db, 'users', cred.user.uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    const isSuper = (cred.user.email || '').toLowerCase() === 'satvik.koya@betternatureofficial.org';
    await setDoc(ref, {
      id: cred.user.uid,
      email: cred.user.email,
      name: cred.user.displayName || '',
      role: isSuper ? 'super_admin' : 'member',
      chapter_id: null,
      events_attended: 0,
      hours_logged: 0,
      meals_rescued: 0,
      created_at: serverTimestamp(),
    });
  }
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
