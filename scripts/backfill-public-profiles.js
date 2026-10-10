#!/usr/bin/env node
/**
 * A2 backfill — mint /public_profiles rows for every existing /users
 * document using the SAME reconciler the trigger uses
 * (functions/lib/publicProfileProjection.js). This closes R9 — one
 * canonical projection, so backfill and trigger cannot drift.
 *
 * USAGE
 *   # Preview (no mutation; prints counts + non-PII sample):
 *   node scripts/backfill-public-profiles.js --dry-run
 *
 *   # Apply:
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *     node scripts/backfill-public-profiles.js
 *
 * Script never logs email, phone, verification state, or ID URLs.
 * The sample section carries only display_name / chapter_id /
 * role_label / lbs / hours — the same values the leaderboard
 * publicly shows.
 */

const admin = require('firebase-admin');
const DRY_RUN = process.argv.includes('--dry-run');
const SAMPLE_LIMIT = 5;

const { project, projectionsEqual, ALLOWLIST } =
  require('../functions/lib/publicProfileProjection');

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  console.log(`[A2 backfill] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  const usersSnap = await db.collection('users').get();
  let total = 0, candidates = 0, skippedTombstone = 0,
      wouldWrite = 0, unchanged = 0, wrote = 0,
      pubRemoved = 0, errors = 0;
  const samples = [];

  for (const d of usersSnap.docs) {
    total += 1;
    const uid = d.id;
    const next = project(uid, d.data());

    // Tombstoned / merged source: ensure the mirror is removed too.
    if (!next) {
      skippedTombstone += 1;
      const pub = await db.collection('public_profiles').doc(uid).get();
      if (pub.exists) {
        if (!DRY_RUN) {
          try { await pub.ref.delete(); pubRemoved += 1; }
          catch (e) { errors += 1; console.warn('delete failed', uid, e?.message); }
        } else {
          pubRemoved += 1; // counted as "would remove"
        }
      }
      continue;
    }

    candidates += 1;
    const existing = await db.collection('public_profiles').doc(uid).get();
    const changed = !(existing.exists && projectionsEqual(existing.data(), next));

    if (!changed) { unchanged += 1; continue; }
    wouldWrite += 1;

    if (samples.length < SAMPLE_LIMIT) {
      samples.push({
        uid,
        display_name: next.display_name,
        chapter_id: next.chapter_id,
        role_label: next.role_label,
        lbs_rescued: next.lbs_rescued,
        hours_logged: next.hours_logged,
      });
    }

    if (!DRY_RUN) {
      try {
        await db.collection('public_profiles').doc(uid).set(next, { merge: false });
        wrote += 1;
      } catch (e) {
        errors += 1;
        console.warn('write failed', uid, e?.message);
      }
    }
  }

  console.log(JSON.stringify({
    total,
    candidates,
    skipped_tombstoned_or_merged: skippedTombstone,
    unchanged,
    would_write: wouldWrite,
    wrote,
    public_rows_removed_for_tombstones: pubRemoved,
    errors,
    allowlist: ALLOWLIST,
    sample: samples,
  }, null, 2));
  if (errors > 0) process.exit(2);
}

main().catch((e) => { console.error('[A2 backfill] failed', e); process.exit(1); });
