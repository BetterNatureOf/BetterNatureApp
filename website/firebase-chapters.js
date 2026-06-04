// Web-side reader for the `chapters` Firestore collection. Returns
// every active chapter ordered alphabetically by city, with the
// denormalized fields the app writes (president_name, member_count,
// officers, country) included so the marketing site can render the
// chapter cards without joining to /users.
//
// Mirrors src/services/database.js → fetchChapters() in the app.
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from './firebase-auth.js';

export async function listChapters() {
  try {
    const snap = await getDocs(collection(db, 'chapters'));
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => !c.status || c.status === 'active');
    list.sort((a, b) => (a.city || a.name || '').localeCompare(b.city || b.name || ''));
    return list;
  } catch (e) {
    console.warn('listChapters failed', e);
    return [];
  }
}
