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
 * /public_profiles together, then writes the destination with the
 * source's observed revision marker (source_rev). On commit retry
 * the transaction re-reads live state, so a late event never
 * resurrects a deleted mirror and an older /users snapshot cannot
 * stomp a newer one.
 *
 * `source_rev` is pulled from the /users row's `updated_at`
 * timestamp when present. If the source has no `updated_at` we
 * fall back to writing without preconditions (first write of a
 * long-lived legacy row); subsequent writes get the precondition
 * once the row has been touched.
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
    const srcData = srcSnap.data();
    const next = project(uid, srcData);
    if (!next) {
      if (pubSnap.exists) {
        tx.delete(pubRef);
        return 'deleted';
      }
      return 'missing_source';
    }
    const existing = pubSnap.exists ? pubSnap.data() : null;
    // Stale-event guard — if the mirror already carries a
    // source_rev newer than this event's /users snapshot, skip.
    // Compares the stored ms-epoch; falls through when either side
    // lacks a timestamp (legacy rows), relying on the transaction
    // itself to serialise.
    const incomingRev = toMillis(srcData.updated_at);
    const existingRev = existing ? toMillis(existing.source_rev) : 0;
    if (incomingRev && existingRev && existingRev >= incomingRev) {
      return 'skipped_stale';
    }
    // Short-circuit no-op writes — a private-field edit shouldn't
    // bump the mirror's updated_at. But still write if the mirror
    // is missing (destination repair).
    if (existing && projectionsEqual(existing, next)) {
      return 'unchanged';
    }
    tx.set(pubRef, { ...next, source_rev: incomingRev || null }, { merge: false });
    return 'wrote';
  });
}

function toMillis(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') { try { return v.toMillis(); } catch { return 0; } }
  if (v.seconds != null && v.nanoseconds != null) return v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6);
  const d = new Date(v); return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

module.exports = { project, projectionsEqual, reconcile, ALLOWLIST, roleLabel };
