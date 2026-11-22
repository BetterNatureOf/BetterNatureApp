// One way to call the app's server side.
//
// Production runs the server on a free Cloudflare Worker (the "rescue
// engine", workers/rescue-engine) because Cloud Functions need Google
// billing. Set EXPO_PUBLIC_RESCUE_ENGINE_URL to its URL and every call goes
// there, using the same Firebase callable protocol (the signed-in user's
// ID token travels with it). Without that setting, calls go to Firebase
// Cloud Functions (used by the local functions emulator).
import { getFunctions, httpsCallable, httpsCallableFromURL } from 'firebase/functions';
import { firebaseApp } from '../config/firebase';

export const ENGINE_URL = ((typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_RESCUE_ENGINE_URL) || '').replace(/\/$/, '');

export function serverFunction(name) {
  const fns = getFunctions(firebaseApp);
  return ENGINE_URL ? httpsCallableFromURL(fns, `${ENGINE_URL}/${name}`) : httpsCallable(fns, name);
}

export async function callServer(name, data = {}) {
  return (await serverFunction(name)(data)).data;
}

// After the app writes a pickup directly (start a run, release, receipt…),
// tell the engine so dispatch, holds and notices update right away instead
// of at its next one-minute check. Best effort: the check catches misses.
export function pickupChanged(pickupId) {
  if (!ENGINE_URL || !pickupId) return;
  callServer('pickupChanged', { pickupId }).catch(() => {});
}
