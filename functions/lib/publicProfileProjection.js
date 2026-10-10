// Shared projector used by both the Firestore onWrite trigger and
// the one-shot backfill. One canonical source so the two paths can
// never drift. See firestore.rules /public_profiles block for the
// paired policy.

const admin = require('firebase-admin');

const ALLOWLIST = [
  'uid',
  'display_name',
  'chapter_id',
  'avatar_url',
  'lbs_rescued',
  'hours_logged',
  'events_attended',
  'points',
  'leaderboard_score',
  'pickups_dropped',
  'meals_rescued',
  'referral_code',
  'role_label',
  'updated_at',
];

function roleLabel(raw) {
  if (!raw) return 'member';
  if (raw === 'super_admin' || raw === 'admin' || raw === 'executive') return 'exec';
  if (raw === 'chapter_president' || raw === 'chapter_pres') return 'president';
  if (raw === 'restaurant') return 'partner';
  return 'member';
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * Project a /users row to the public shape, or null when the user
 * should NOT have a mirror (tombstoned / merged-away).
 */
function project(uid, data) {
  if (!data) return null;
  if (data.deleted_at) return null;
  if (data.merged_into) return null;
  return {
    uid,
    display_name: String(data.name || data.display_name || '').slice(0, 80),
    chapter_id: data.chapter_id || null,
    avatar_url: data.avatar_url || null,
    lbs_rescued: num(data.lbs_rescued) || Math.round(num(data.meals_rescued) / 1.2),
    hours_logged: num(data.hours_logged),
    events_attended: num(data.events_attended),
    points: num(data.points),
    leaderboard_score: num(data.leaderboard_score),
    pickups_dropped: num(data.pickups_dropped),
    meals_rescued: num(data.meals_rescued),
    referral_code: data.referral_code || null,
    role_label: roleLabel(data.role),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Compare two projected rows ignoring updated_at. Returns true when
 * any allowlisted field changed. Used to short-circuit no-op writes
 * so a private-field edit doesn't bump the public row's timestamp.
 */
function projectionsEqual(a, b) {
  if (!a || !b) return false;
  for (const k of ALLOWLIST) {
    if (k === 'updated_at') continue;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Reconcile a single uid: writes/deletes/repairs the mirror based
 * on the current /users state. Idempotent. Used by both the trigger
 * (after resolving the current /users snapshot inside the trigger)
 * and the backfill. Returns one of 'wrote' | 'unchanged' | 'deleted'
 * | 'missing_source'.
 *
 * Takes an admin firestore handle so the caller controls batching.
 */
async function reconcile(db, uid) {
  const srcSnap = await db.doc(`users/${uid}`).get();
  const pubRef = db.doc(`public_profiles/${uid}`);
  const pubSnap = await pubRef.get();
  if (!srcSnap.exists) {
    if (pubSnap.exists) {
      await pubRef.delete(); // propagate — see note in trigger wrapper
      return 'deleted';
    }
    return 'missing_source';
  }
  const next = project(uid, srcSnap.data());
  if (!next) {
    if (pubSnap.exists) {
      await pubRef.delete();
      return 'deleted';
    }
    return 'missing_source';
  }
  // R9 — if the destination is missing but should exist, write it
  // even when the "before"/"after" projections of this one event
  // match. This repairs a mirror that an earlier failed trigger
  // (or a backfill-skipped tombstone) left behind.
  const existing = pubSnap.exists ? pubSnap.data() : null;
  if (existing && projectionsEqual(existing, next)) return 'unchanged';
  await pubRef.set(next, { merge: false });
  return 'wrote';
}

module.exports = { project, projectionsEqual, reconcile, ALLOWLIST, roleLabel };
