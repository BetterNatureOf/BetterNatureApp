// OneSignal Web SDK wrapper — lazy-loads the script the first time
// we need it, exposes requestPush() + disablePush() that write the
// player id back onto users/{uid} so the dispatcher knows where to
// fan out push notifications.
//
// Native (React Native / Expo) will swap this file for an
// onesignal-expo-plugin shim later. Same public surface:
//   - ensureOneSignal()
//   - requestPush(uid)
//   - disablePush(uid)
//   - getPlayerId()
import { Platform } from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { ONESIGNAL_APP_ID } from '../config/notifications';

const SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

export function ensureOneSignal() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return Promise.reject(new Error('OneSignal Web SDK only runs in a browser'));
  }
  if (!ONESIGNAL_APP_ID) {
    return Promise.reject(new Error('Missing EXPO_PUBLIC_ONESIGNAL_APP_ID'));
  }
  if (window.__bnOneSignal) return Promise.resolve(window.OneSignal);
  if (window.__bnOneSignalLoading) return window.__bnOneSignalLoading;

  window.__bnOneSignalLoading = new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const s = document.createElement('script');
    s.src = SDK_URL; s.async = true; s.defer = true;
    s.onload = () => {
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false }, // we render our own toggle
            promptOptions: {
              slidedown: { enabled: false },  // ditto
            },
          });
          window.__bnOneSignal = true;
          resolve(OneSignal);
        } catch (e) { reject(e); }
      });
    };
    s.onerror = () => reject(new Error('Failed to load OneSignal SDK'));
    document.head.appendChild(s);
  });
  return window.__bnOneSignalLoading;
}

export async function getPlayerId() {
  try {
    const OneSignal = await ensureOneSignal();
    // v16 API surface
    const id = OneSignal.User?.PushSubscription?.id || null;
    return id;
  } catch { return null; }
}

// Triggers the browser's native permission prompt and writes the
// resulting OneSignal player id (subscription id in v16) back onto
// the user doc so the dispatcher can target this device.
export async function requestPush(uid) {
  const OneSignal = await ensureOneSignal();
  // v16: opt the user in. Browser shows the native prompt.
  await OneSignal.Notifications.requestPermission();
  // Give the SDK a moment to register the subscription before we read it
  await new Promise((r) => setTimeout(r, 400));
  const playerId = OneSignal.User?.PushSubscription?.id || null;
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
    const OneSignal = await ensureOneSignal();
    await OneSignal.User?.PushSubscription?.optOut?.();
  } catch {}
  if (isFirebaseConfigured && uid) {
    await updateDoc(doc(db, 'users', uid), {
      push_enabled: false,
      onesignal_player_id: null,
      push_disabled_at: serverTimestamp(),
    });
  }
}
