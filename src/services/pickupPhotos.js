// Photo upload for the 60-second pickup flow. Restaurants snap a picture
// of the surplus food → we upload it to Firebase Storage and stamp the
// resulting URL on the pickup doc so volunteers see what they're claiming.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../config/firebase';

export async function uploadPickupPhoto(restaurantId, fileUri) {
  if (!isFirebaseConfigured || !fileUri) return null;
  const fileName = `pickups/${restaurantId || 'anon'}-${Date.now()}.jpg`;
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const r = ref(storage, fileName);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return await getDownloadURL(r);
}
