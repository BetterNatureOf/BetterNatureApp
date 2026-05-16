// Web-side reader for the `fridges` Firestore collection. Mirrors the
// app's services/fridges.js. Returns only active fridges with valid
// coordinates so the Leaflet map can plot them directly.
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from './firebase-auth.js';

export async function listFridges() {
  try {
    const q = query(collection(db, 'fridges'), where('active', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((f) => f.lat != null && f.lng != null);
  } catch (e) {
    console.warn('listFridges failed', e);
    return [];
  }
}
