#!/usr/bin/env node
/**
 * A2 backfill — mint /public_profiles rows for every existing /users
 * document using the same allowlist the syncPublicProfileOnWrite
 * Cloud Function applies. Idempotent and safe to re-run.
 *
 * Normally the trigger alone would backfill as users edit their
 * profiles, but we want public rosters/leaderboards to work the
 * moment the trigger is deployed — before anyone touches their
 * record. One-shot backfill fixes that.
 *
 * USAGE
 *   # Preview (no writes, prints counts + a non-PII sample):
 *   node scripts/backfill-public-profiles.js --dry-run
 *
 *   # Apply:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/backfill-public-profiles.js
 *
 * The service account needs roles/datastore.user on the Firestore
 * project (same one the dispatcher uses). Never check that JSON in.
 *
 * This script does NOT copy any field outside the allowlist in
 * functions/syncPublicProfile.js. It never logs email, phone,
 * verification state or ID URLs — only counts and the first few
 * display names, which are the same strings the leaderboard shows.
 */

const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const SAMPLE_LIMIT = 5;

function roleLabel(raw) {
  if (!raw) return 'member';
  if (raw === 'super_admin' || raw === 'admin' || raw === 'executive') return 'exec';
  if (raw === 'chapter_president' || raw === 'chapter_pres') return 'president';
  if (raw === 'restaurant') return 'partner';
  return 'member';
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function buildPublic(uid, data) {
  if (data?.deleted_at || data?.merged_into) return null; // tombstoned / redirect — skip
  return {
    uid,
    display_name: String(data?.name || data?.display_name || '').slice(0, 80),
    chapter_id: data?.chapter_id || null,
    avatar_url: data?.avatar_url || null,
    lbs_rescued: num(data?.lbs_rescued) || Math.round(num(data?.meals_rescued) / 1.2),
    hours_logged: num(data?.hours_logged),
    events_attended: num(data?.events_attended),
    points: num(data?.points),
    leaderboard_score: num(data?.leaderboard_score),
    pickups_dropped: num(data?.pickups_dropped),
    meals_rescued: num(data?.meals_rescued),
    referral_code: data?.referral_code || null,
    role_label: roleLabel(data?.role),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  console.log(`[A2 backfill] mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);
  const usersSnap = await db.collection('users').get();
  const total = usersSnap.size;
  let candidates = 0;
  let skippedTombstone = 0;
  let wouldWrite = 0;
  let unchanged = 0;
  let wrote = 0;
  const samples = [];

  for (const doc of usersSnap.docs) {
    candidates += 1;
    const next = buildPublic(doc.id, doc.data());
    if (!next) { skippedTombstone += 1; continue; }

    // Compare to existing public_profile to count real changes.
    const existing = await db.collection('public_profiles').doc(doc.id).get();
    let changed = true;
    if (existing.exists) {
      const prev = existing.data();
      const keys = Object.keys(next).filter((k) => k !== 'updated_at');
      changed = keys.some((k) => prev[k] !== next[k]);
    }

    if (!changed) { unchanged += 1; continue; }
    wouldWrite += 1;

    if (samples.length < SAMPLE_LIMIT) {
      samples.push({
        uid: doc.id,
        display_name: next.display_name,
        chapter_id: next.chapter_id,
        role_label: next.role_label,
        lbs_rescued: next.lbs_rescued,
        hours_logged: next.hours_logged,
      });
    }

    if (!DRY_RUN) {
      await db.collection('public_profiles').doc(doc.id).set(next, { merge: false });
      wrote += 1;
    }
  }

  console.log(JSON.stringify({
    total,
    candidates,
    skipped_tombstoned_or_merged: skippedTombstone,
    unchanged,
    would_write: wouldWrite,
    wrote,
    sample: samples, // display_name/chapter/role_label only — no PII
  }, null, 2));
}

main().catch((e) => { console.error('[A2 backfill] failed', e); process.exit(1); });
