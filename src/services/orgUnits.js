// OrgUnit — Phase 1 slice 2 introduction.
//
// Blueprint §17 requires organizational units (national / region /
// chapter / project / committee / event / partner org) as first-class
// entities that Memberships + RoleAssignments can point at. Today's
// data model treats chapters and partner restaurants as top-level
// collections; the blueprint unifies them under one `org_units`
// collection so scope-aware permissions ("chapter president of unit X")
// have a single referent.
//
// Migration approach: dual-write with lazy backfill. This slice does
// NOT rewrite readers — every existing screen keeps reading `chapters`
// and `restaurants` directly. The `org_units` table is a shadow index
// created on demand the first time someone writes a Membership or
// RoleAssignment that references a chapter/partner. Slice 3 flips the
// authoritative reader over; slice 4 removes the legacy writes.
//
// OrgUnit doc id ≡ the id of the underlying chapter/restaurant/etc.
// so cross-lookups are O(1) — `chapters/{X}` and `org_units/{X}` are
// the same row conceptually.
import {
  doc, setDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

export const ORG_UNIT_TYPES = Object.freeze({
  NATIONAL:   'national',
  REGION:     'region',
  CHAPTER:    'chapter',
  PROJECT:    'project',
  COMMITTEE:  'committee',
  EVENT:      'event',
  PARTNER:    'partner',
});

// Idempotent — safe to call from every dual-write path.
async function ensureOrgUnit({ id, type, name, parent_id = null, extras = {} }) {
  if (!isFirebaseConfigured || !id) return null;
  const ref = doc(db, 'org_units', id);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id, ...snap.data() };
  const data = {
    type,
    name: name || '',
    parent_id,
    status: 'active',
    created_at: serverTimestamp(),
    ...extras,
  };
  try {
    await setDoc(ref, data, { merge: true });
    return { id, ...data };
  } catch (e) {
    // Rules failures during the dual-write window shouldn't break the
    // legacy write — log and let the primary write continue.
    console.warn('ensureOrgUnit failed', id, e?.message);
    return null;
  }
}

// Convenience wrappers so callers don't need to hand-name their types.
export function ensureOrgUnitForChapter(chapterId, extras = {}) {
  return ensureOrgUnit({
    id: chapterId,
    type: ORG_UNIT_TYPES.CHAPTER,
    name: extras.name || '',
    parent_id: extras.parent_id || null,
    extras,
  });
}
export function ensureOrgUnitForPartner(restaurantId, extras = {}) {
  return ensureOrgUnit({
    id: restaurantId,
    type: ORG_UNIT_TYPES.PARTNER,
    name: extras.name || '',
    parent_id: extras.chapter_id || null,
    extras,
  });
}
export function ensureOrgUnitForNational() {
  return ensureOrgUnit({
    id: 'national',
    type: ORG_UNIT_TYPES.NATIONAL,
    name: 'BetterNature National',
  });
}

export async function getOrgUnit(id) {
  if (!isFirebaseConfigured || !id) return null;
  const snap = await getDoc(doc(db, 'org_units', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
