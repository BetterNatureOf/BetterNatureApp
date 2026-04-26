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

export async function getProfile(userId) {
  if (!isFirebaseConfigured) return makeMockUser({});
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
