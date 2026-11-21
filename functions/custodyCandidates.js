// Eligible volunteers a coordinator can hand a held, collected run to.
// Presidents can't list private profiles under A2, so the custody picker
// asks the server, which applies the same eligibility as the rules
// (eligibleCustodian in firestore.rules) and returns only what the
// coordinator needs to call them.
const { HttpsError } = require('firebase-functions/v1/https');
const { canCoordinate } = require('./receivingSites');

const rolesOf = (u) => [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])];

function eligibleCustodian(u, chapterId) {
  return !!u && u.chapter_id === chapterId && !u.disabled && !u.deleted_at &&
    !['pending', 'rejected', 'disabled', 'suspended'].includes(u.member_status) &&
    u.verification_status === 'approved' && u.contract_volunteer_signed === true &&
    u.driver_setup_complete === true && !rolesOf(u).some((r) => ['restaurant', 'partner'].includes(r));
}

async function listCustodyCandidates(db, data, uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const pickupId = typeof data?.pickupId === 'string' ? data.pickupId : '';
  if (!pickupId || pickupId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a rescue.');
  const [caller, pickupSnap] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`pickups/${pickupId}`).get()]);
  const pickup = pickupSnap.data();
  if (!pickup) throw new HttpsError('not-found', 'Rescue not found.');
  if (!canCoordinate(caller.data(), pickup.chapter_id)) {
    throw new HttpsError('permission-denied', 'Only this chapter’s coordinators can transfer custody.');
  }
  const members = await db.collection('users').where('chapter_id', '==', pickup.chapter_id).get();
  const busySnap = await db.collection('pickups').where('chapter_id', '==', pickup.chapter_id)
    .where('status', 'in', ['claimed', 'enroute']).get();
  const busy = new Set(busySnap.docs.map((d) => d.data().claimed_by).filter(Boolean));
  return {
    candidates: members.docs
      .filter((d) => d.id !== pickup.claimed_by && d.id !== pickup.receiver_uid && eligibleCustodian(d.data(), pickup.chapter_id))
      .map((d) => ({ id: d.id, name: d.data().name || d.data().full_name || 'Volunteer', phone: d.data().phone || '',
        busy: busy.has(d.id) }))
      .sort((a, b) => Number(a.busy) - Number(b.busy) || a.name.localeCompare(b.name)),
  };
}

module.exports = { listCustodyCandidates, eligibleCustodian };
