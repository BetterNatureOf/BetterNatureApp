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
 * on the current /users state. Idempotent.
 *
 * B7 — runs inside a Firestore transaction so a stale invocation
 * cannot overwrite a newer one. The transaction reads /users and
 * /public_profiles together, then writes the destination from the
 * CURRENT /users state. On commit retry the transaction re-reads
 * live state, so a late event never resurrects a deleted mirror
 * and an older /users snapshot cannot stomp a newer one — the
 * trigger invocation is effectively just a scheduling signal.
 *
 * F7 — the previous version additionally compared `updated_at`
 * timestamps and returned `skipped_stale` when the mirror's stored
 * `source_rev` was >= the source's `updated_at`. That broke
 * legitimate current-state updates: many /users writes in this
 * codebase don't bump `updated_at`, so a real change (name, hours)
 * was silently skipped. The transaction's live read + rewrite is
 * sufficient; drop the client-timestamp guard entirely.
 */
async function reconcile(db, uid) {
  const srcRef = db.doc(`users/${uid}`);
  const pubRef = db.doc(`public_profiles/${uid}`);
  return db.runTransaction(async (tx) => {
    const [srcSnap, pubSnap] = await Promise.all([tx.get(srcRef), tx.get(pubRef)]);
    if (!srcSnap.exists) {
      if (pubSnap.exists) {
        tx.delete(pubRef);
        return 'deleted';
      }
      return 'missing_source';
    }
    const next = project(uid, srcSnap.data());
    if (!next) {
      if (pubSnap.exists) {
        tx.delete(pubRef);
        return 'deleted';
      }
      return 'missing_source';
    }
    const existing = pubSnap.exists ? pubSnap.data() : null;
    // Short-circuit no-op writes — a private-field edit shouldn't
    // bump the mirror's updated_at. But still write if the mirror
    // is missing (destination repair) or the projection changed.
    if (existing && projectionsEqual(existing, next)) {
      return 'unchanged';
    }
    tx.set(pubRef, next, { merge: false });
    return 'wrote';
  });
}

module.exports = { project, projectionsEqual, reconcile, ALLOWLIST, roleLabel };
