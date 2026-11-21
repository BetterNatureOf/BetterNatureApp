// Mirrors the safe subset of /users/{uid} into /public_profiles/{uid}.
//
// /users docs hold private data (email, phone, address, push tokens,
// notification prefs) and the rules now only let the member, execs and
// their own chapter's staff read them. Leaderboards, event rosters,
// member-of-the-month and referral lookups read this mirror instead.
const { FieldValue } = require('firebase-admin/firestore');

const PUBLIC_FIELDS = [
  'name', 'full_name', 'avatar_url', 'chapter_id', 'role', 'roles', 'referral_code',
  'leaderboard_score', 'meals_rescued', 'lbs_rescued', 'hours_logged',
  'events_attended', 'pickups_completed',
];

function publicProfile(user) {
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (user[key] !== undefined) out[key] = user[key];
  }
  return out;
}

function isHidden(user) {
  return !user || !!user.deleted_at || user.disabled === true;
}

async function mirrorPublicProfile(db, uid, before, after) {
  const ref = db.collection('public_profiles').doc(uid);
  if (isHidden(after)) {
    await ref.delete();
  } else {
    await ref.set({ ...publicProfile(after), updated_at: FieldValue.serverTimestamp() });
  }

  // Referral credit: the new member can only write their own doc, so the
  // inviter's count is bumped here, once, when referred_by first appears.
  const inviter = after?.referred_by;
  if (inviter && !before?.referred_by && inviter !== uid) {
    await db.collection('users').doc(inviter).update({
      referrals_count: FieldValue.increment(1),
      referrals_updated_at: FieldValue.serverTimestamp(),
    }).catch((e) => console.warn('referral credit failed', inviter, e.message));
  }
}

module.exports = { PUBLIC_FIELDS, publicProfile, mirrorPublicProfile };
