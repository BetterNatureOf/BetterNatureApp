// Firestore trigger: mirror /users/{uid} → /public_profiles/{uid}
// with a strict allowlist.
//
// Why a trigger (not a client write): clients are explicitly denied
// from writing /public_profiles so no browser-side JS can inject
// email, verification_status, ID urls or fabricate contribution
// totals into the public view. The mirror runs with the service
// account, enforces the allowlist in one place, and is the only
// writer to that collection outside of exec-controlled backfill.
//
// Allowlist — these are the ONLY fields that leave /users:
//   display_name           - owner-controlled display label (users.name)
//   chapter_id             - mirrored for chapter rosters/leaderboard filter
//   avatar_url             - owner-controlled image URL
//   lbs_rescued            - leaderboard total
//   hours_logged           - leaderboard total
//   events_attended        - leaderboard total
//   points / leaderboard_score - leaderboard score components
//   pickups_dropped        - public reliability counter
//   meals_rescued          - legacy total still displayed
//   referral_code          - lookups by refer code (public by design)
//   role_label             - human-readable role bucket, NOT the raw auth role
//   updated_at             - freshness
//
// Deliberately excluded (private — never mirrored):
//   email, phone, dob, age_band, guardian_* , address, city, state, zip,
//   push_tokens, onesignal_player_id, notif_* preferences, sms_consent*,
//   email_consent, verification_status, id_front_url, id_back_url,
//   driver_license_*, member_status, restaurant_status, disabled,
//   disabled_at, pending_chapter_*, chapter_request_status,
//   signed_contracts_*, merged_into, linked_google_emails, deleted_at,
//   raw `role` string, raw `roles[]` array.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Map the raw auth role to a public, human-readable bucket. Keeps
// the actual auth label out of the public collection — a leaderboard
// never needs to know whether someone is 'super_admin' vs 'admin' vs
// 'executive'; one label is enough.
function roleLabel(raw) {
  if (!raw) return 'member';
  if (raw === 'super_admin' || raw === 'admin' || raw === 'executive') return 'exec';
  if (raw === 'chapter_president' || raw === 'chapter_pres') return 'president';
  if (raw === 'restaurant') return 'partner';
  if (raw === 'member' || raw === 'volunteer') return 'member';
  return 'member';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildPublic(uid, data) {
  if (!data) return null;
  // Tombstoned accounts drop out of the public view entirely.
  if (data.deleted_at) return { __delete: true };
  // merged_into accounts are redirect stubs — no public presence.
  if (data.merged_into) return { __delete: true };

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

exports.syncPublicProfileOnWrite = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const pubRef = admin.firestore().doc(`public_profiles/${uid}`);

    // Deletion: wipe the public mirror.
    if (!change.after.exists) {
      try { await pubRef.delete(); } catch (e) { /* already gone */ }
      return null;
    }

    const next = buildPublic(uid, change.after.data());
    if (!next) return null;
    if (next.__delete) {
      try { await pubRef.delete(); } catch (e) {}
      return null;
    }

    // Short-circuit: if nothing in the allowlist changed since the
    // last mirror, skip the write. Avoids spamming updated_at on
    // every private-field edit (phone number change, consent toggle)
    // and keeps the public collection quiet.
    const prev = change.before.exists ? buildPublic(uid, change.before.data()) : null;
    if (prev && !prev.__delete) {
      const keys = Object.keys(next).filter((k) => k !== 'updated_at');
      const changed = keys.some((k) => prev[k] !== next[k]);
      if (!changed) return null;
    }

    await pubRef.set(next, { merge: false });
    return null;
  });
