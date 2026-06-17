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
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Log the raw count + every doc's name and status so a curious
    // user can open the devtools console and see exactly what the
    // marketing site received from Firestore. This is the fastest
    // way to tell "deploy is stale" vs "Firestore is empty" vs
    // "doc was created with a status we're filtering out."
    console.log(`[bn] chapters raw from Firestore: ${raw.length}`);
    raw.forEach((c) => console.log(`  - ${c.name || c.id} · status=${c.status || '(none)'}`));
    // Show unless explicitly disabled. Anything tombstoned with
    // deleted_at, or stamped status:'inactive'/'deleted', stays
    // hidden. Legacy docs missing the status field (e.g. Memphis
    // created before createChapter started auto-stamping status)
    // are treated as active so they don't silently vanish from
    // the public site.
    const inactive = new Set(['inactive', 'deleted', 'rejected']);
    const list = raw.filter((c) => !c.deleted_at && !inactive.has(c.status));
    list.sort((a, b) => (a.city || a.name || '').localeCompare(b.city || b.name || ''));
    console.log(`[bn] chapters after filter: ${list.length}`);
    return list;
  } catch (e) {
    console.warn('[bn] listChapters failed', e);
    return [];
  }
}
