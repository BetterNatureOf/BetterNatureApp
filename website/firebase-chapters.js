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
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Show anything that isn't explicitly deactivated or soft-deleted.
    // Treats a missing/unknown status the same as 'active' so a chapter
    // that was created before the status field rolled out still shows.
    list = list.filter((c) =>
      !c.deleted_at && c.status !== 'inactive' && c.status !== 'deleted'
    );
    list.sort((a, b) => (a.city || a.name || '').localeCompare(b.city || b.name || ''));
    return list;
  } catch (e) {
    console.warn('listChapters failed', e);
    throw e;
  }
}
