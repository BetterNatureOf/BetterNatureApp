// Single source of truth for the denormalized fields the marketing
// website reads off each chapter doc:
//
//   chapters/{id} = {
//     president_name,        // string for the chapter-card label
//     member_count,          // number for "N members" pill
//     officers: {             // populated officer slots, public-safe
//       president, vice_president, treasurer,
//       volunteer_coordinator, secretary,
//     },
//     roster: [{ id, name, role, instagram }],  // full member list
//   }
//
// Triggered whenever member data changes:
//   - ManageChapters loads chapters + members
//   - ManageMembers saveEdit (role / chapter_id / name / etc.)
//   - updateUserRole / updateUserChapter (service-layer helpers)
//
// Multi-role aware: checks both `role` and `roles[]` so an exec who
// is also a chapter pres fills the President slot and gets stamped
// onto chapters/{id}.president_name + officers.president.
//
// Idempotent: compares before/after via JSON.stringify and skips
// the write when nothing has changed.

import { doc, getDoc, getDocs, collection, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

function hasChapterRole(u, key) {
  const all = new Set([u.role || 'member', ...(Array.isArray(u.roles) ? u.roles : [])]);
  if (key === 'chapter_president') return all.has('chapter_president') || all.has('chapter_pres');
  return all.has(key);
}

function chapterLabel(u) {
  if (hasChapterRole(u, 'chapter_president')) return 'President';
  if (hasChapterRole(u, 'chapter_vp'))        return 'Vice President';
  if (hasChapterRole(u, 'chapter_treas'))     return 'Treasurer';
  if (hasChapterRole(u, 'chapter_vol_coord')) return 'Volunteer Coordinator';
  if (hasChapterRole(u, 'chapter_sec'))       return 'Secretary';
  return 'Member';
}

function officerObj(u) {
  return u ? { id: u.id, name: u.name || '', email: u.email || '' } : null;
}

// Denormalize ONE chapter's leadership + roster + counts. `members`
// is the full org-wide users list — we filter to this chapter
// in-function so callers don't have to. Returns { changed: bool }.
export async function syncChapterDenorm(chapterId, members) {
  if (!isFirebaseConfigured || !chapterId) return { changed: false };
  const chSnap = await getDoc(doc(db, 'chapters', chapterId));
  if (!chSnap.exists()) return { changed: false };
  const ch = { id: chSnap.id, ...chSnap.data() };

  const inChapter = (members || []).filter(
    (u) => u.chapter_id === chapterId && (u.role || 'member') !== 'restaurant'
  );

  const pres  = inChapter.find((u) => hasChapterRole(u, 'chapter_president'));
  const vp    = inChapter.find((u) => hasChapterRole(u, 'chapter_vp'));
  const sec   = inChapter.find((u) => hasChapterRole(u, 'chapter_sec'));
  const tres  = inChapter.find((u) => hasChapterRole(u, 'chapter_treas'));
  const volCo = inChapter.find((u) => hasChapterRole(u, 'chapter_vol_coord'));

  const nextOfficers = {
    president:             officerObj(pres),
    vice_president:        officerObj(vp),
    treasurer:             officerObj(tres),
    volunteer_coordinator: officerObj(volCo),
    secretary:             officerObj(sec),
  };

  const seen = new Set();
  const nextRoster = [];
  for (const u of inChapter) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    const name = u.name || u.full_name || '';
    if (!name) continue;
    nextRoster.push({ id: u.id, name, role: chapterLabel(u), instagram: u.instagram || '' });
  }

  const nextPres  = pres?.name || '';
  const nextCount = inChapter.length;

  // Diff via stringify so a trailing-whitespace name typo triggers
  // the write too. Cheap relative to the network round-trip.
  const officersStr = JSON.stringify(nextOfficers);
  const rosterStr   = JSON.stringify(nextRoster);
  const changed =
    ch.president_name !== nextPres ||
    ch.member_count !== nextCount ||
    JSON.stringify(ch.officers || {}) !== officersStr ||
    JSON.stringify(ch.roster || [])   !== rosterStr;

  if (!changed) return { changed: false };

  await updateDoc(doc(db, 'chapters', chapterId), {
    president_name: nextPres,
    member_count: nextCount,
    officers: nextOfficers,
    roster: nextRoster,
    updated_at: serverTimestamp(),
  });
  return { changed: true };
}

// Convenience: pull the full members list and the chapter list off
// Firestore and re-denorm every chapter. Used by ManageMembers
// after a role/chapter change since the caller doesn't know which
// chapter(s) need updating (a role change might move someone from
// one chapter to another via chapter_id edit in the same save).
export async function resyncAllChapters() {
  if (!isFirebaseConfigured) return { synced: 0 };
  const [usnap, csnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'chapters')),
  ]);
  const members = usnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const chapterIds = csnap.docs.map((d) => d.id);
  let synced = 0;
  for (const cid of chapterIds) {
    try {
      const r = await syncChapterDenorm(cid, members);
      if (r.changed) synced++;
    } catch (e) { console.warn('chapter denorm failed', cid, e); }
  }
  return { synced };
}
