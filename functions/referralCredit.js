// Referral credit. The new member can only write their own /users
// doc, so the inviter's referrals_count is bumped here, once, when
// referred_by first appears on the new member's profile.
const { FieldValue } = require('firebase-admin/firestore');

async function creditReferral(db, uid, before, after) {
  const inviter = after?.referred_by;
  if (!inviter || before?.referred_by || inviter === uid || typeof inviter !== 'string' || inviter.includes('/')) {
    return false;
  }
  const marker = db.collection('referral_credits').doc(uid);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return false;
    const inviterRef = db.collection('users').doc(inviter);
    if (!(await tx.get(inviterRef)).exists) return false;
    tx.update(inviterRef, {
      referrals_count: FieldValue.increment(1),
      referrals_updated_at: FieldValue.serverTimestamp(),
    });
    tx.create(marker, { inviter, credited_at: FieldValue.serverTimestamp() });
    return true;
  });
}

module.exports = { creditReferral };
