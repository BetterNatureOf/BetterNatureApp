// J1 — scheduled recovery for notification work that the live
// callable failed to finish. Reads `/notification_work` where
// status == 'pending' AND last_attempt_at < now - LEASE_WINDOW,
// then RE-RUNS the same fanOut using the frozen payload +
// recipient list. fanOut uses deterministic doc IDs with create()
// semantics, so already-written halves are preserved and the
// missing halves get created.
//
// Only marks the work (and matching dedup receipt) completed when
// every bell+outbox pair confirms present. A work doc that fails
// resumption MAX_WORK_ATTEMPTS times is marked `failed` with the
// last error so operators can inspect.
//
// Pairs with the queueBusinessNotification callable; see
// functions/queueNotification.js for the live-path write.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const LEASE_WINDOW_MS = 60 * 1000;
const BATCH_LIMIT = 20;
const MAX_WORK_ATTEMPTS = 10;

function safeKeyFragment(s) {
  return String(s || '').replace(/[\/\s]/g, '_').slice(0, 400);
}

async function tryClaimAndResume(db, workSnap, resumeFn) {
  const workRef = workSnap.ref;
  // Attempt a fenced claim: transactionally bump attempts +
  // last_attempt_at only if we still see the pending status +
  // the same last_attempt_at we read. Another sweep running
  // concurrently loses the race here.
  const claimed = await db.runTransaction(async (tx) => {
    const live = await tx.get(workRef);
    if (!live.exists) return false;
    const d = live.data();
    if (d.status !== 'pending') return false;
    const liveMs = d.last_attempt_at && d.last_attempt_at.toMillis
      ? d.last_attempt_at.toMillis() : 0;
    const originalMs = workSnap.data().last_attempt_at && workSnap.data().last_attempt_at.toMillis
      ? workSnap.data().last_attempt_at.toMillis() : 0;
    if (liveMs !== originalMs) return false; // another sweep already took it
    if ((d.attempts || 0) >= MAX_WORK_ATTEMPTS) {
      tx.set(workRef, {
        status: 'failed',
        failed_at: admin.firestore.FieldValue.serverTimestamp(),
        reason: 'max_attempts_exceeded',
      }, { merge: true });
      return false;
    }
    tx.set(workRef, {
      last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
      attempts: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
    return true;
  });
  if (!claimed) return 'skipped';

  const work = workSnap.data();
  let out;
  try {
    out = await resumeFn(db, work);
  } catch (e) {
    console.warn('[sweepNotificationDedup] resume failed', work.key, e?.message);
    return 'error';
  }

  if (out.allPairsPresent !== false) {
    // Mark both work + dedup receipt completed.
    await workRef.set({
      status: 'completed',
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      inapp: out.inapp || 0,
      queued: out.queued || 0,
    }, { merge: true });
    const dedupRef = db.collection('notification_dedup').doc(safeKeyFragment(work.key));
    await dedupRef.set({
      status: 'completed',
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      inapp: out.inapp || 0,
      queued: out.queued || 0,
      recovered_by: 'sweep',
    }, { merge: true });
    return 'completed';
  }
  // Still missing halves — leave as pending; next sweep tries again.
  return 'pending';
}

exports.sweepNotificationDedup = functions
  .runWith({ failurePolicy: true })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const db = admin.firestore();
    const { _resumeFromWork } = require('./queueNotification');
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - LEASE_WINDOW_MS);
    const snap = await db.collection('notification_work')
      .where('status', '==', 'pending')
      .where('last_attempt_at', '<', cutoff)
      .limit(BATCH_LIMIT)
      .get();
    if (snap.empty) return null;
    const counts = { completed: 0, pending: 0, skipped: 0, error: 0 };
    for (const d of snap.docs) {
      try {
        const r = await tryClaimAndResume(db, d, _resumeFromWork);
        counts[r] = (counts[r] || 0) + 1;
      } catch (e) {
        counts.error += 1;
        console.warn('[sweepNotificationDedup]', d.id, e?.message);
      }
    }
    console.log(`[sweepNotificationDedup] processed=${snap.size}`, counts);
    return null;
  });
