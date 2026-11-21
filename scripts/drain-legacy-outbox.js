#!/usr/bin/env node
/**
 * One-shot drain for pre-A2 notifications_outbox rows.
 *
 * Before A2 the client stuffed `channel` + `player_id` + `email`
 * directly into each outbox doc. That schema let an authenticated
 * user queue a mail to an arbitrary address, which R10 flagged.
 * The new dispatcher refuses rows carrying those fields and marks
 * them `rejected` as it encounters them — this script simply does
 * the same thing in bulk at deploy time, so no email is sent for
 * backlog rows before step 7 of the deploy plan clears them.
 *
 * USAGE
 *   node scripts/drain-legacy-outbox.js --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/drain-legacy-outbox.js
 *
 * Idempotent: a second run only touches rows still in `queued`.
 */

const admin = require('firebase-admin');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const q = await db.collection('notifications_outbox').where('status', '==', 'queued').get();
  let scanned = 0, legacy = 0, newFormat = 0, errors = 0;

  for (const d of q.docs) {
    scanned += 1;
    const r = d.data();
    const isLegacy = r.channel != null || r.player_id != null || r.email != null;
    if (!isLegacy) { newFormat += 1; continue; }
    try {
      if (!DRY_RUN) {
        await d.ref.update({
          status: 'rejected',
          error: 'legacy_format_dropped',
          sent_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      legacy += 1;
    } catch (e) {
      errors += 1;
      console.warn('drain update failed', d.id, e?.message);
    }
  }
  console.log(JSON.stringify({ scanned, legacy_dropped: legacy, new_format_untouched: newFormat, errors }, null, 2));
}

main().catch((e) => { console.error('[drain] failed', e); process.exit(1); });
