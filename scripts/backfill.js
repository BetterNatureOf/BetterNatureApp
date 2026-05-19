/*
 * One-shot backfill for the production Firestore database.
 *
 * What it does:
 *   1. Counts user docs with role === 'member' and writes that number to
 *      org_stats/global.volunteers so the marketing-site ticker reflects
 *      the people who signed up before we started incrementing on signup.
 *   2. Stamps phone_normalized on every user doc that has a `phone` but
 *      no `phone_normalized`. Required for the duplicate-phone check to
 *      match historical signups.
 *
 * How to run:
 *   1. Install firebase-admin (one-time):       npm i -D firebase-admin
 *   2. Get a service account key from
 *        Firebase Console → Project Settings → Service accounts
 *        → "Generate new private key"
 *      Save it as serviceAccount.json in this folder (gitignored).
 *   3. node scripts/backfill.js
 *
 * Safe to re-run: every step is idempotent.
 */
const admin = require('firebase-admin');
const path = require('path');

const KEY_PATH = path.join(__dirname, 'serviceAccount.json');
let key;
try { key = require(KEY_PATH); }
catch {
  console.error('Missing serviceAccount.json. See header comment for setup.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

async function backfillVolunteerCounter() {
  console.log('— Volunteer counter —');
  const snap = await db.collection('users').where('role', '==', 'member').get();
  const count = snap.size;
  console.log(`  members in users: ${count}`);
  await db.doc('org_stats/global').set(
    { volunteers: count, updated_at: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log(`  org_stats/global.volunteers = ${count}  ✓`);
}

async function backfillNormalizedPhones() {
  console.log('— phone_normalized backfill —');
  const snap = await db.collection('users').get();
  let updated = 0, skipped = 0;
  const batch = db.batch();
  let inBatch = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const phone = d.phone;
    if (!phone) { skipped++; continue; }
    const normalized = normalizePhone(phone);
    if (!normalized || d.phone_normalized === normalized) { skipped++; continue; }
    batch.update(doc.ref, { phone_normalized: normalized });
    updated++; inBatch++;
    if (inBatch >= 400) { await batch.commit(); inBatch = 0; }
  }
  if (inBatch > 0) await batch.commit();
  console.log(`  updated: ${updated},  skipped: ${skipped}  ✓`);
}

(async () => {
  try {
    await backfillVolunteerCounter();
    await backfillNormalizedPhones();
    console.log('\nDone.');
    process.exit(0);
  } catch (e) {
    console.error('Backfill failed:', e);
    process.exit(1);
  }
})();
