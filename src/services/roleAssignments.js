// RoleAssignment — Phase 1 slice 2 introduction.
//
// Blueprint §2.3: a role is an assignment WITHIN a membership scope.
// Each assignment stores title, permission template, scope, start,
// end, appointing authority, approving authority, agreement version,
// training status, and current standing. A user can hold many active
// role assignments across many scopes concurrently.
//
// This slice adds the entity + dual-write from grantRole/revokeRole.
// The legacy user.role + user.roles[] fields remain authoritative for
// every reader through slice 3.
//
// Doc id ≡ `${user_id}_${role_key}_${scope_org_unit_id}` so re-granting
// the same role within the same scope is an idempotent upsert instead
// of a duplicate row.
import {
  doc, setDoc, getDoc, getDocs, collection, query, where,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';
import { ensureOrgUnitForChapter, ensureOrgUnitForNational } from './orgUnits';

export const ROLE_ASSIGNMENT_STATUS = Object.freeze({
  ACTIVE:    'active',
  ENDED:     'ended',
  SUSPENDED: 'suspended',
  PENDING:   'pending',
});

// Which permission template maps to each role key. Templates are the
// blueprint §2.4 permission bundles; we start with a minimal mapping
// and let it grow — slice 3+ reads through it for permission checks.
export const ROLE_TO_TEMPLATE = Object.freeze({
  executive:         'exec_full',
  admin:             'exec_full',
  super_admin:       'exec_full',
  chapter_president: 'chapter_lead',
  chapter_pres:      'chapter_lead',
  chapter_vp:        'chapter_ops',
  chapter_treas:     'chapter_finance',
  chapter_vol_coord: 'chapter_ops',
  chapter_sec:       'chapter_ops',
  partner:           'partner_post',
  restaurant:        'partner_post',
  member:            'member_base',
});

function assignmentId(user_id, role_key, scope_id) {
  return `${user_id}_${role_key}_${scope_id || 'unscoped'}`;
}

// Some roles are org-wide (exec/admin) — scope those to 'national'.
// Chapter-officer roles are scoped to the user's current chapter.
// Partner roles are scoped to the partner OrgUnit (which equals the
// restaurant_id for now).
export function defaultScopeFor(role_key, { chapterId, partnerId } = {}) {
  if (['executive', 'admin', 'super_admin'].includes(role_key)) return 'national';
  if (['partner', 'restaurant'].includes(role_key)) return partnerId || chapterId || null;
  return chapterId || null;
}

// Idempotent upsert. Ensures the scope OrgUnit exists first so the
// reference isn't dangling.
export async function upsertRoleAssignment({
  user_id, role_key, scope_id, chapter_name,
  appointed_by = null, agreement_version = null,
}) {
  if (!isFirebaseConfigured || !user_id || !role_key) return null;
  const scope = scope_id || 'unscoped';
  try {
    if (scope === 'national') await ensureOrgUnitForNational();
    else if (scope !== 'unscoped') await ensureOrgUnitForChapter(scope, { name: chapter_name });
    const id = assignmentId(user_id, role_key, scope);
    const ref = doc(db, 'role_assignments', id);
    const existing = await getDoc(ref);
    const data = {
      user_id,
      role_key,
      permission_template: ROLE_TO_TEMPLATE[role_key] || 'member_base',
      scope_id: scope,
      status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
      appointed_by,
      agreement_version,
      updated_at: serverTimestamp(),
      ...(existing.exists() ? {} : { start_date: serverTimestamp() }),
      // clear any prior end_date on re-grant — Phase 2 will make
      // ended assignments require a new row instead of resurrecting
      end_date: null,
    };
    await setDoc(ref, data, { merge: true });
    return { id, ...data };
  } catch (e) {
    console.warn('upsertRoleAssignment failed', user_id, role_key, e?.message);
    return null;
  }
}

// Mark ended. Keeps the row for historical record per blueprint §1.
export async function endRoleAssignment({ user_id, role_key, scope_id, reason = null }) {
  if (!isFirebaseConfigured || !user_id || !role_key) return;
  const scope = scope_id || 'unscoped';
  try {
    const ref = doc(db, 'role_assignments', assignmentId(user_id, role_key, scope));
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, {
      status: ROLE_ASSIGNMENT_STATUS.ENDED,
      end_date: serverTimestamp(),
      end_reason: reason,
      updated_at: serverTimestamp(),
    });
  } catch (e) {
    console.warn('endRoleAssignment failed', user_id, role_key, e?.message);
  }
}

export async function getActiveRoleAssignments(user_id) {
  if (!isFirebaseConfigured || !user_id) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'role_assignments'),
      where('user_id', '==', user_id),
      where('status', '==', ROLE_ASSIGNMENT_STATUS.ACTIVE),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('getActiveRoleAssignments failed', e?.message);
    return [];
  }
}
