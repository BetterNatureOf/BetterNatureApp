// Audit log — Phase 1 slice 3 foundation.
//
// Blueprint §17 requires an AuditEvent entity that records every
// role/approval/privileged action with actor, action, resource,
// prior/new values, timestamp, and reason. This module is the
// write-side surface; the read-side (an admin-only audit browser)
// ships in Phase 2 with the Compliance Dashboard.
//
// Every writer should call logAuditEvent() best-effort — a rules
// failure or offline blip never breaks the primary write it's
// recording. Reads are gated to exec+admin in firestore.rules.
//
// Doc format is intentionally minimal + append-only. No updates,
// no deletes. Slice 4+ adds retention policies + jurisdiction tags.
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../config/firebase';

// Canonical action verbs — keep to this vocabulary so an audit filter
// stays sane. New actions get added here explicitly, not typed inline.
export const AUDIT_ACTIONS = Object.freeze({
  ROLE_GRANTED:      'role.granted',
  ROLE_REVOKED:      'role.revoked',
  MEMBERSHIP_CHANGED:'membership.changed',
  USER_DISABLED:     'user.disabled',
  USER_RESTORED:     'user.restored',
  AGREEMENT_SIGNED:  'agreement.signed',
  PICKUP_VERIFIED:   'pickup.verified',
  CHAPTER_APPROVED:  'chapter.approved',
  CHAPTER_DENIED:    'chapter.denied',
  JOIN_APPROVED:     'join.approved',
  JOIN_DENIED:       'join.denied',
});

// Fire-and-forget. Callers should always await if they want to make
// sure the write attempts, but they should never rely on this
// throwing — audit is observability, not a gate.
export async function logAuditEvent({
  actor_uid = null,
  actor_email = null,
  action,
  resource_type = null,
  resource_id = null,
  prior = null,
  next = null,
  reason = null,
  scope_org_unit_id = null,
}) {
  if (!isFirebaseConfigured || !action) return;
  try {
    await addDoc(collection(db, 'audit_events'), {
      actor_uid,
      actor_email,
      action,
      resource_type,
      resource_id,
      prior,
      next,
      reason,
      scope_org_unit_id,
      at: serverTimestamp(),
    });
  } catch (e) {
    // Never surface — audit failures shouldn't block anything.
    console.warn('audit log write failed', action, e?.message);
  }
}
