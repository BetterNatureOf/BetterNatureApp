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
 * Two ways to authenticate, pick whichever your org allows:
 *
 *   A) Application Default Credentials (recommended — no key file needed,
 *      works even when the org blocks service account key creation):
 *        brew install --cask google-cloud-sdk   # one-time
 *        gcloud auth application-default login
 *        gcloud config set project better-nature-app
 *        node scripts/backfill.js
 *
 *   B) Service account key:
 *        Firebase Console → Project Settings → Service Accounts
 *        → Generate new private key → save as scripts/serviceAccount.json
 *        node scripts/backfill.js
 *
 * Safe to re-run — every step is idempotent.
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = 'better-nature-app';
const KEY_PATH = path.join(__dirname, 'serviceAccount.json');

// Try a service account file first; fall back to ADC. The fall-back makes
// this script work even when org policy disables service-account keys —
// `gcloud auth application-default login` is enough.
if (fs.existsSync(KEY_PATH)) {
  const key = require(KEY_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(key),
    projectId: key.project_id || PROJECT_ID,
  });
  console.log('Auth: service-account key');
} else {
  // applicationDefault() reads ADC from `gcloud auth application-default
  // login` or the GOOGLE_APPLICATION_CREDENTIALS env var.
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
  console.log('Auth: Application Default Credentials');
}

const db = admin.firestore();

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

async function backfillVolunteerCounter() {
  console.log('\n— Volunteer counter —');
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
  console.log('\n— phone_normalized backfill —');
  const snap = await db.collection('users').get();
  let updated = 0, skipped = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const phone = d.phone;
    if (!phone) { skipped++; continue; }
    const normalized = normalizePhone(phone);
    if (!normalized || d.phone_normalized === normalized) { skipped++; continue; }
    batch.update(doc.ref, { phone_normalized: normalized });
    updated++; inBatch++;
    if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
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
    console.error('\nBackfill failed:', e?.message || e);
    if (e?.code === 7 || /PERMISSION_DENIED/.test(String(e))) {
      console.error('\nThe credentials don’t have Firestore access. If you used ADC,');
      console.error('make sure you ran: gcloud auth application-default login');
      console.error('and that your account has the Firebase Admin / Firestore role.');
    }
    process.exit(1);
  }
})();
