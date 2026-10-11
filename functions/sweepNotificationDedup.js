// I2 — scheduled takeover for notification_dedup receipts that
// are stuck 'in_progress' past their lease. Covers the gap where
// a caller crashed mid-fanOut and no subsequent explicit retry
// ever landed. We don't re-run fanOut from here (we don't know
// the original payload); we mark the receipt 'expired' with a
// reason so operators + exec dashboards can see what dropped,
// and the client's next legitimate call for that transition
// (different key) proceeds normally.
//
// This isn't a full dispatcher recovery — proper per-row retries
// still live in the dispatcher worker. It is specifically about
// not leaving the dedup ledger lying about delivery state.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const LEASE_WINDOW_MS = 60 * 1000;
const BATCH_LIMIT = 100;

exports.sweepNotificationDedup = functions
  .runWith({ failurePolicy: true })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - LEASE_WINDOW_MS);
    const snap = await db.collection('notification_dedup')
      .where('status', '==', 'in_progress')
      .where('started_at', '<', cutoff)
      .limit(BATCH_LIMIT)
      .get();
    if (snap.empty) return null;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.set(d.ref, {
        status: 'expired',
        expired_at: admin.firestore.FieldValue.serverTimestamp(),
        reason: 'lease_window_elapsed',
      }, { merge: true });
    }
    await batch.commit();
    console.log(`[sweepNotificationDedup] marked ${snap.size} stuck receipt(s) expired`);
    return null;
  });
