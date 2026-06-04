// Notification config — pulled from Expo public env so it ships
// to the web bundle without leaking server-side secrets. The
// REST API keys live ONLY in the Cloudflare Worker environment.
//
// Set in `.env` / Cloudflare Pages env / app.json:
//   EXPO_PUBLIC_ONESIGNAL_APP_ID="00000000-0000-0000-0000-000000000000"
//   EXPO_PUBLIC_NOTIFY_PROVIDER="onesignal"  (default; future: "expo-push")
import Constants from 'expo-constants';

const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};

export const ONESIGNAL_APP_ID =
  process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID
  || extra.onesignalAppId
  || '';

export const NOTIFY_PROVIDER =
  process.env.EXPO_PUBLIC_NOTIFY_PROVIDER
  || extra.notifyProvider
  || 'onesignal';

// Notification "kinds" — must match the toggles on the user doc:
//   notif_volunteer, notif_pickup, notif_general
// Any kind not in this map falls back to notif_general.
export const KIND_PREF = {
  volunteer:    'notif_volunteer',
  pickup:       'notif_pickup',
  pickup_alert: 'notif_pickup',
  general:      'notif_general',
  broadcast:    'notif_general',
  welcome:      'notif_general',
};

export function prefKeyForKind(kind) {
  return KIND_PREF[kind] || 'notif_general';
}
