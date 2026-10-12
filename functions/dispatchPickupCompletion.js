// Immediate server-side fanout; A2's scheduled sweep recovers pending work.
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
async function dispatch(snap) {
  const db = admin.firestore();
  const { _resumeFromWork } = require('./queueNotification');
  for (const key of snap.data().notification_keys || []) {
    const workRef = db.doc(`notification_work/${key}`), work = await workRef.get();
    if (!work.exists) throw new Error(`Missing completion work: ${key}`);
    if (work.data().status === 'completed') continue;
    const out = await _resumeFromWork(db, work.data());
    if (out.allPairsPresent === false) throw new Error(`Incomplete notification pair: ${key}`);
    const batch = db.batch(), done = { status: 'completed', completed_at: FieldValue.serverTimestamp() };
    batch.set(workRef, done, { merge: true });
    batch.set(db.doc(`notification_dedup/${key}`), done, { merge: true });
    await batch.commit();
  }
}
exports.dispatchPickupCompletion = functions.runWith({ failurePolicy: true })
  .firestore.document('pickup_completions/{id}').onCreate(dispatch);
exports._dispatch = dispatch;
