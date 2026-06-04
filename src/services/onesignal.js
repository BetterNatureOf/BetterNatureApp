// OneSignal — temporarily disabled.
//
// The native SDK + Expo plugin were pulling in extra build steps
// that were breaking deploys, so we've stripped the integration
// down to a no-op shim while we sort that out. The public API
// stays the same so every caller (App.js, useAuth.js,
// NotificationPreferences, etc.) keeps compiling and runtime-
// behaviour is just "no push notifications".
//
// When we re-enable, swap this file back to the platform-split
// implementation in git history (commit 46fce58 or 120aff1).
// The notification dispatcher already routes 'email' channel
// outbox docs through Resend without needing OneSignal at all,
// so emails and in-app bells continue working unchanged.

export function initializeOneSignal() {
  return Promise.resolve();
}

export function ensureOneSignal() {
  return Promise.reject(new Error('OneSignal is temporarily disabled'));
}

export async function getPlayerId() {
  return null;
}

export async function login() { return; }
export async function logout() { return; }
export async function addEmail() { return; }
export async function removeEmail() { return; }
export async function setTags() { return; }
export async function setLogLevel() { return; }

export async function requestPush() {
  throw new Error('Push notifications are temporarily disabled. Email + in-app still work.');
}

export async function disablePush(uid) {
  // Still flip the user doc so the dispatcher won't try to send.
  if (!uid) return;
  try {
    const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const { db, isFirebaseConfigured } = await import('../config/firebase');
    if (!isFirebaseConfigured) return;
    await updateDoc(doc(db, 'users', uid), {
      push_enabled: false,
      onesignal_player_id: null,
      push_disabled_at: serverTimestamp(),
    });
  } catch {}
}

export async function addSubscriptionObserver() { return; }
export async function addInAppTrigger() { return; }
