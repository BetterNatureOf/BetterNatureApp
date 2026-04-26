import Constants from 'expo-constants';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Config comes from app.json → extra.firebase, or EXPO_PUBLIC_FIREBASE_* env vars.
// Firebase web API keys are safe to commit (they identify the project, not
// authenticate it). Security is enforced by Firestore rules + Auth.
const cfg = Constants.expoConfig?.extra?.firebase || {};

const firebaseConfig = {
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
