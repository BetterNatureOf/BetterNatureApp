/*
 * Seeds org_stats/global with the chapter-reported totals so the
 * marketing site ticker, the in-app Welcome / Impact screens, and
 * the executive dashboard all show the same numbers we report in
 * our public dashboard.
 *
 * Numbers below come from the reporting dashboard as of 2026-06-05:
 *   meal kits           6,963
 *   individuals served  6,963
 *   food rescued        2,780 lbs
 *   CO₂ avoided         10,564 lbs
 *   water footprint     486,500 gal
 *
 * Auth: same as scripts/backfill.js — either Application Default
 * Credentials (`gcloud auth application-default login`) or a service
 * account key at scripts/serviceAccount.json.
 *
 * Re-running this script overwrites the doc with these exact values
 * — it does NOT add. The app's bump helpers will resume incrementing
 * from these baselines on the next pickup / event.
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const KEY = path.join(__dirname, 'serviceAccount.json');
if (fs.existsSync(KEY)) {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
} else {
  admin.initializeApp({ projectId: 'better-nature-app' });
}

const db = admin.firestore();

(async () => {
  const seed = {
    meals: 6963,
    individuals: 6963,
    lbs: 2780,
    co2: 10564,
    water: 486500,
    chapters: 6,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.doc('org_stats/global').set(seed, { merge: true });
  console.log('✔ org_stats/global seeded:', seed);
  process.exit(0);
})().catch((e) => {
  console.error('seed failed', e);
  process.exit(1);
});
