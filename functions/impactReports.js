// Verified impact for one volunteer or a whole chapter, from the activity
// ledger (lib/impactLedger.js). Same scope as volunteer history: chapter
// staff see their chapter, execs see everyone.
const { HttpsError } = require('firebase-functions/v1/https');
const { accessFor } = require('./volunteerHistory');
const { reconcile, rollUp } = require('./lib/impactLedger');

async function ledgerFor(db, memberId) {
  const [activity, manual] = await Promise.all([
    db.collection('member_activity').where('user_id', '==', memberId).get(),
    db.collection('users').doc(memberId).collection('manual_volunteer_work').get(),
  ]);
  return {
    activity: activity.docs.map((d) => ({ id: d.id, ...d.data() })),
    manual: manual.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

async function volunteerImpact(db, data, uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const memberId = data?.memberId;
  if (typeof memberId !== 'string' || !memberId || memberId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a volunteer.');
  const [actor, member] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`users/${memberId}`).get()]);
  if (uid !== memberId && !accessFor(actor.data(), member.data())) {
    throw new HttpsError('permission-denied', 'You can only view impact for volunteers in your scope.');
  }
  if (!member.exists) throw new HttpsError('not-found', 'Volunteer not found.');
  return reconcile({ profile: member.data(), ...(await ledgerFor(db, memberId)) });
}

async function chapterImpact(db, data, uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const chapterId = data?.chapterId;
  if (typeof chapterId !== 'string' || !chapterId || chapterId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a chapter.');
  const actor = (await db.doc(`users/${uid}`).get()).data();
  if (!accessFor(actor, { chapter_id: chapterId })) {
    throw new HttpsError('permission-denied', 'You can only view your chapter’s impact.');
  }
  const members = await db.collection('users').where('chapter_id', '==', chapterId).get();
  const rows = [];
  for (const m of members.docs) {
    const result = reconcile({ profile: m.data(), ...(await ledgerFor(db, m.id)) });
    rows.push({ id: m.id, name: m.data().name || m.data().full_name || 'Member', result });
  }
  return rollUp(rows);
}

module.exports = { volunteerImpact, chapterImpact };
