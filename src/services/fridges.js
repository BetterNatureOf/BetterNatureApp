// Community fridge network. Volunteers drop off rescued food at one of
// these. Each fridge belongs to a chapter (so they bubble up by city) and
// has a coarse capacity hint so dispatchers don't all pile onto one.
//
// Doc shape (fridges/{id}):
//   {
//     name: 'Cooper-Young Fridge',
//     address: '2150 Young Ave, Memphis, TN',
//     city: 'Memphis', state: 'TN',
//     lat: 35.1240, lng: -89.9970,
//     chapter_id: 'ch-memphis',
//     hours: 'Open 24/7' | '7am – 9pm',
//     capacity: 'low' | 'medium' | 'high',   // soft hint shown in app
//     active: true,
//     created_at: <server ts>,
//   }
import { collection, doc, getDoc, getDocs, query, where, orderBy, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

const COL = 'fridges';

export async function listFridges({ chapterId } = {}) {
  if (!isFirebaseConfigured) return [];
  let q;
  if (chapterId) {
    q = query(collection(db, COL), where('chapter_id', '==', chapterId), where('active', '==', true));
  } else {
    q = query(collection(db, COL), where('active', '==', true), orderBy('city'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getFridge(id) {
  if (!isFirebaseConfigured || !id) return null;
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createFridge(data) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const ref = await addDoc(collection(db, COL), {
    ...data,
    active: data.active ?? true,
    created_at: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

export async function updateFridge(id, updates) {
  if (!isFirebaseConfigured) return;
  await updateDoc(doc(db, COL, id), { ...updates, updated_at: serverTimestamp() });
}

// Distance helper for sorting fridges nearest-first when a volunteer is
// dropping off. Haversine, returns miles.
export function milesBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
