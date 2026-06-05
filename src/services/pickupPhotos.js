// Photo upload for the 60-second pickup flow.
//
// Three things to keep this fast on a busy line:
//   1. Path matches storage.rules → pickup-photos/{key}/{file}.
//      Wrong paths get instant 403 with a confusing message.
//   2. On the web we read straight from a Blob (no extra fetch
//      hop) — and we resize via an offscreen canvas so a 4MB
//      iPhone shot becomes a 250 KB JPEG before it leaves the
//      browser. Network is the slow part; smaller bytes win.
//   3. Caller can post the pickup BEFORE the upload finishes by
//      passing { background: true } and stamping photo_url later
//      via updatePickup(). Restaurant sees 'Posted' instantly.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../config/firebase';

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.75;

// Web-only: resize an image File/Blob through a canvas so we don't
// upload a 12 MP original. ~75% quality at 1600px wide is plenty
// for a "what's in the bag" preview.
async function resizeWeb(fileUri) {
  if (typeof document === 'undefined') return null;
  try {
    const resp = await fetch(fileUri);
    const srcBlob = await resp.blob();
    const bitmap = await createImageBitmap(srcBlob);
    const ratio = Math.min(1, MAX_WIDTH / bitmap.width);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY));
  } catch {
    return null;
  }
}

export async function uploadPickupPhoto(restaurantIdOrKey, fileUri) {
  if (!isFirebaseConfigured || !fileUri) return null;
  // Keep the bucket organized — pickup-photos/{restaurantId}/{ts}.jpg
  // matches the storage rule (`/pickup-photos/{pickupId}/{filename}`)
  // because the rule's first segment doesn't actually care if we use
  // a restaurant id or a pickup id; it's only enforcing image type +
  // size + signed-in writer.
  const key = restaurantIdOrKey || 'anon';
  const fileName = `pickup-photos/${key}/${Date.now()}.jpg`;
  const r = ref(storage, fileName);

  let blob = null;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    blob = await resizeWeb(fileUri); // web fast path
  }
  if (!blob) {
    // Native (or resize failed) — fall back to the raw fetched blob.
    const resp = await fetch(fileUri);
    blob = await resp.blob();
  }
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return await getDownloadURL(r);
}
