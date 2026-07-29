// Membership — Phase 1 slice 2 introduction.
//
// Blueprint §2.2 model: a Membership links a person to an
// organizational unit. It does NOT confer leadership authority
// (that's a RoleAssignment). A user's full record of "where I belong"
// is the collection of their memberships across chapters, projects,
// committees, events, and national.
//
// Dual-write pattern: every path that currently writes user.chapter_id
// also writes a Membership row here. Readers keep reading user.chapter_id
// through slice 3; the two systems stay consistent because there is
// only one write path (updateUserChapter → both places).
//
// Membership doc id ≡ `${user_id}_${org_unit_id}` for O(1) upsert.
//
// Statuses per blueprint §2.2:
//   applicant · active · leave · alumni · suspended · pending · transferred
import {
  doc, setDoc, getDoc, getDocs, collection, query, where,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { ensureOrgUnitForChapter } from './orgUnits';

export const MEMBERSHIP_STATUS = Object.freeze({
  APPLICANT:   'applicant',
  ACTIVE:      'active',
  LEAVE:       'leave',
  ALUMNI:      'alumni',
  SUSPENDED:   'suspended',
  PENDING:     'pending',
  TRANSFERRED: 'transferred',
});

function membershipId(userId, orgUnitId) { return `${userId}_${orgUnitId}`; }

// Idempotent upsert. Called by dual-write paths — never throws to the
// caller (best-effort; legacy fields remain authoritative for now).
export async function upsertMembership({
  user_id, org_unit_id, status = MEMBERSHIP_STATUS.ACTIVE, membership_class = 'chapter',
  chapter_name,
}) {
  if (!isFirebaseConfigured || !user_id || !org_unit_id) return null;
  try {
    // Ensure the OrgUnit exists so the reference isn't dangling.
    await ensureOrgUnitForChapter(org_unit_id, { name: chapter_name || '' });
    const id = membershipId(user_id, org_unit_id);
    const ref = doc(db, 'memberships', id);
    const existing = await getDoc(ref);
    const data = {
      user_id,
      org_unit_id,
      status,
      membership_class,
      updated_at: serverTimestamp(),
      ...(existing.exists() ? {} : { join_date: serverTimestamp() }),
    };
    await setDoc(ref, data, { merge: true });
    return { id, ...data };
  } catch (e) {
    console.warn('upsertMembership failed', user_id, org_unit_id, e?.message);
    return null;
  }
}

// End a membership when a user transfers OUT of a chapter. Doesn't
// delete — the historical record is required by blueprint §1 ("no
// erased history").
export async function endMembership({ user_id, org_unit_id, next_status = MEMBERSHIP_STATUS.TRANSFERRED }) {
  if (!isFirebaseConfigured || !user_id || !org_unit_id) return;
  try {
    const ref = doc(db, 'memberships', membershipId(user_id, org_unit_id));
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, {
      status: next_status,
      end_date: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  } catch (e) {
    console.warn('endMembership failed', user_id, org_unit_id, e?.message);
  }
}

export async function getMembershipsForUser(user_id) {
  if (!isFirebaseConfigured || !user_id) return [];
  try {
    const snap = await getDocs(query(collection(db, 'memberships'), where('user_id', '==', user_id)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('getMembershipsForUser failed', e?.message);
    return [];
  }
}
