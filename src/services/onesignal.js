// ─────────────────────────────────────────────────────────────────────
//  BetterNature centralized OneSignal wrapper.
//
//  Single module that owns every OneSignal SDK call in the app.
//  Other code calls these helpers and never imports OneSignal
//  directly — this is the contract from the OneSignal AI prompt.
//
//  Native (iOS / Android via Expo dev build):
//    Uses `react-native-onesignal` (the official RN SDK, 5.x).
//    The expo plugin (onesignal-expo-plugin) handles native
//    project surgery at prebuild time.
//
//  Web (Cloudflare Pages bundle):
//    Lazy-loads the OneSignal Web SDK (v16) from the CDN. The
//    same public surface, so callers don't branch on Platform.OS.
//
//  Player id / subscription id is mirrored onto users/{uid} in
//  Firestore so the notification dispatcher can target the device.
// ─────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { ONESIGNAL_APP_ID } from '../config/notifications';

// ─── Web-only SDK loader ────────────────────────────────────────────
const WEB_SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

function loadWebSdk() {
  if (window.__bnOneSignal) return Promise.resolve(window.OneSignal);
  if (window.__bnOneSignalLoading) return window.__bnOneSignalLoading;
  window.__bnOneSignalLoading = new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const s = document.createElement('script');
    s.src = WEB_SDK_URL; s.async = true; s.defer = true;
    s.onload = () => {
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false },
            promptOptions: { slidedown: { enabled: false } },
          });
          window.__bnOneSignal = true;
          resolve(OneSignal);
        } catch (e) { reject(e); }
      });
    };
    s.onerror = () => reject(new Error('Failed to load OneSignal Web SDK'));
    document.head.appendChild(s);
  });
  return window.__bnOneSignalLoading;
}

// ─── Native-only init ───────────────────────────────────────────────
// Called once from App.js. Idempotent.
let _nativeInitialized = false;
let _nativeOneSignal = null;
function loadNativeSdk() {
  if (_nativeInitialized) return _nativeOneSignal;
  if (!ONESIGNAL_APP_ID) {
    console.warn('OneSignal: missing app id (EXPO_PUBLIC_ONESIGNAL_APP_ID)');
    return null;
  }
  // Lazy require so web bundles never pull native code.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { OneSignal } = require('react-native-onesignal');
  OneSignal.initialize(ONESIGNAL_APP_ID);
  _nativeOneSignal = OneSignal;
  _nativeInitialized = true;
  return OneSignal;
}

// ─── Public API ─────────────────────────────────────────────────────
// 1) Initialization. Web inits lazily on first call; native inits
//    once from App.js via initializeOneSignal().
export function initializeOneSignal() {
  if (Platform.OS === 'web') {
    // Web defers init to the first interactive call so we don't
    // block first paint with a CDN fetch.
    return Promise.resolve();
  }
  loadNativeSdk();
  return Promise.resolve();
}

export function ensureOneSignal() {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('OneSignal Web SDK needs a browser'));
    }
    if (!ONESIGNAL_APP_ID) {
      return Promise.reject(new Error('Missing EXPO_PUBLIC_ONESIGNAL_APP_ID'));
    }
    return loadWebSdk();
  }
  const sdk = loadNativeSdk();
  if (!sdk) return Promise.reject(new Error('OneSignal native SDK failed to load'));
  return Promise.resolve(sdk);
}

// 2) Subscription id — the address the dispatcher uses.
export async function getPlayerId() {
  try {
    const sdk = await ensureOneSignal();
    if (Platform.OS === 'web') {
      return sdk.User?.PushSubscription?.id || null;
    }
    return await sdk.User.pushSubscription.getIdAsync();
  } catch { return null; }
}

// 3) Identity. Call after Firebase sign-in so OneSignal can scope
//    notifications to the BN user, not the device.
export async function login(externalUserId) {
  if (!externalUserId) return;
  try {
    const sdk = await ensureOneSignal();
    if (Platform.OS === 'web') await sdk.login(externalUserId);
    else sdk.login(externalUserId);
  } catch (e) { console.warn('OneSignal.login failed', e); }
}

export async function logout() {
  try {
    const sdk = await ensureOneSignal();
    if (Platform.OS === 'web') await sdk.logout();
    else sdk.logout();
  } catch {}
}

// 4) Email + SMS subscriptions managed by the SDK (in addition to
//    our own Firestore field, for OneSignal-side segmentation).
export async function addEmail(email) {
  if (!email) return;
  const sdk = await ensureOneSignal();
  if (Platform.OS === 'web') await sdk.User.addEmail(email);
  else sdk.User.addEmail(email);
}
export async function removeEmail(email) {
  if (!email) return;
  const sdk = await ensureOneSignal();
  if (Platform.OS === 'web') await sdk.User.removeEmail(email);
  else sdk.User.removeEmail(email);
}

// 5) Tags — let the dashboard segment by chapter / role / etc.
export async function setTags(tags) {
  if (!tags || !Object.keys(tags).length) return;
  const sdk = await ensureOneSignal();
  if (Platform.OS === 'web') await sdk.User.addTags(tags);
  else sdk.User.addTags(tags);
}

// 6) Logging — turn up while debugging an integration.
export async function setLogLevel(level = 'WARN') {
  try {
    const sdk = await ensureOneSignal();
    if (Platform.OS === 'web') {
      // Web SDK uses Debug helpers via OneSignal.Debug.setLogLevel
      sdk.Debug?.setLogLevel?.(level);
    } else {
      const { LogLevel } = require('react-native-onesignal');
      sdk.Debug.setLogLevel(LogLevel[level] ?? LogLevel.Warn);
    }
  } catch {}
}

// 7) Permission prompt — the BetterNature Notification Preferences
//    screen calls this when the user taps "Enable push".
export async function requestPush(uid) {
  const sdk = await ensureOneSignal();
  if (Platform.OS === 'web') {
    await sdk.Notifications.requestPermission();
  } else {
    await sdk.Notifications.requestPermission(true);
  }
  // Give the SDK a tick to register before we read the id back.
  await new Promise((r) => setTimeout(r, 400));
  const playerId = await getPlayerId();
  if (!playerId) {
    throw new Error('Push permission denied or no subscription created');
  }
  if (isFirebaseConfigured && uid) {
    await updateDoc(doc(db, 'users', uid), {
      onesignal_player_id: playerId,
      push_enabled: true,
      push_enabled_at: serverTimestamp(),
    });
  }
  return playerId;
}

export async function disablePush(uid) {
  try {
    const sdk = await ensureOneSignal();
    if (Platform.OS === 'web') await sdk.User.PushSubscription?.optOut?.();
    else sdk.User.pushSubscription.optOut();
  } catch {}
  if (isFirebaseConfigured && uid) {
    await updateDoc(doc(db, 'users', uid), {
      push_enabled: false,
      onesignal_player_id: null,
      push_disabled_at: serverTimestamp(),
    });
  }
}

// 8) Push subscription observer. Used by the welcome dialog the
//    OneSignal AI prompt asks us to show on first registration.
export async function addSubscriptionObserver(fn) {
  const sdk = await ensureOneSignal();
  if (Platform.OS === 'web') {
    sdk.User.PushSubscription.addEventListener?.('change', (ev) => {
      fn({ previous: ev?.previous, current: ev?.current });
    });
  } else {
    sdk.User.pushSubscription.addEventListener('change', (ev) => {
      fn({ previous: ev?.previous, current: ev?.current });
    });
  }
}

// 9) In-App messages — used by the welcome flow.
export async function addInAppTrigger(key, value) {
  const sdk = await ensureOneSignal();
  if (Platform.OS === 'web') sdk.InAppMessages?.addTrigger?.(key, value);
  else sdk.InAppMessages.addTrigger(key, value);
}
