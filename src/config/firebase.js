import Constants from 'expo-constants';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Config comes from app.json → extra.firebase, or EXPO_PUBLIC_FIREBASE_* env vars.
// Firebase web API keys are safe to commit (they identify the project, not
// authenticate it). Security is enforced by Firestore rules + Auth.
const cfg = Constants.expoConfig?.extra?.firebase || {};

// Local emulator mode: EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1 (see
// `npm run web:emulators`). Only demo-* project ids are accepted, so this
// build can never read or write production data.
export const usingEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === '1';
const EMULATOR_PROJECT = process.env.EXPO_PUBLIC_EMULATOR_PROJECT_ID || 'demo-bn-local';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
if (usingEmulators && !EMULATOR_PROJECT.startsWith('demo-')) {
  throw new Error('Emulator mode requires a demo-* project id.');
}

const firebaseConfig = usingEmulators ? {
  apiKey: 'demo-api-key',
  authDomain: `${EMULATOR_PROJECT}.firebaseapp.com`,
  projectId: EMULATOR_PROJECT,
  storageBucket: `${EMULATOR_PROJECT}.appspot.com`,
  appId: 'demo-app',
} : {
  apiKey: cfg.apiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: cfg.authDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: cfg.projectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: cfg.storageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: cfg.messagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: cfg.appId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: cfg.measurementId || process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

// Singleton pattern — avoids "already initialized" errors during Expo fast refresh.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseApp = app;
export const auth = isFirebaseConfigured ? getAuth(app) : null;
export const db = isFirebaseConfigured ? getFirestore(app) : null;
export const storage = isFirebaseConfigured ? getStorage(app) : null;

if (usingEmulators && !globalThis.__bnEmulatorsConnected) {
  globalThis.__bnEmulatorsConnected = true;
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
  connectFunctionsEmulator(getFunctions(app), EMULATOR_HOST, 5001);
}
