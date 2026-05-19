// Push notification registration.
//
// Pipeline:
//   1. App boot → this module asks for permission and grabs an Expo
//      push token from the device.
//   2. We store the token at users/{uid}.push_tokens[] so server-side
//      code can target a user across devices.
//   3. A Firestore-triggered Cloud Function (functions/index.js,
//      sendPushOnNotification) listens for new docs in /notifications,
//      pulls the recipient's tokens, and fires Expo's push API.
//
// What this file owns: step 1 + 2.
// What lives in /functions: step 3.
//
// Web: no-op. The web app uses the on-screen bell badge instead.
//
// We import expo-notifications dynamically so a missing module in an
// older build doesn't crash the app — it'll just skip registration and
// log a warning. Once you `expo install expo-notifications expo-device`,
// the import succeeds and registration runs.
import { Platform } from 'react-native';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

let attempted = false;

export async function registerForPushNotifications(uid) {
  if (Platform.OS === 'web') return null;
  if (!uid || !isFirebaseConfigured) return null;
  if (attempted) return null; // only on first authed mount per session
  attempted = true;

  let Notifications, Device;
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');
  } catch {
    console.info('expo-notifications not installed yet — skipping push registration');
    return null;
  }

  // Real-device only. Simulators don't get push tokens.
  if (Device.isDevice === false) return null;

  // Ask. If denied, bail quietly — the user can re-enable in OS settings.
  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  // Android channel — required for sound/vibration on Android 8+.
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
      });
    } catch {}
  }

  let token;
  try {
    const res = await Notifications.getExpoPushTokenAsync();
    token = res.data;
  } catch (e) {
    console.warn('expo push token error', e);
    return null;
  }
  if (!token) return null;

  // Save to user doc. arrayUnion is idempotent and merges across devices.
  try {
    await updateDoc(doc(db, 'users', uid), { push_tokens: arrayUnion(token) });
  } catch (e) { console.warn('save push token', e); }
  return token;
}
