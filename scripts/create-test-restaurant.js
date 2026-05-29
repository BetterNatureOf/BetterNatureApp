/*
 * Create (or refresh) a test restaurant account so you can log in and
 * see the restaurant portal end-to-end.
 *
 * Run with Application Default Credentials (same setup as backfill.js):
 *   gcloud auth application-default login
 *   gcloud config set project better-nature-app
 *   node scripts/create-test-restaurant.js
 *
 * Defaults below are safe; edit if you want a different email / password.
 * Re-running is idempotent: if the auth user already exists, the script
 * resets its password and re-stamps the Firestore doc.
 */
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const PROJECT_ID = 'better-nature-app';
const KEY_PATH = path.join(__dirname, 'serviceAccount.json');

if (fs.existsSync(KEY_PATH)) {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)), projectId: PROJECT_ID });
} else {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
}

// ── Account spec ──────────────────────────────────────────────────────
// Change these if you'd rather use a different email. Pick a unique
// address — this becomes a real Firebase Auth user.
const SPEC = {
  email: 'test-restaurant@betternatureofficial.org',
  password: 'restaurant-test-1234',
  name: 'Test Bistro',
  city: 'Memphis',
  state: 'TN',
  zip: '38104',
  phone: '901-555-0142',
  address: '2150 Young Ave, Memphis, TN 38104',
  lat: 35.1240,
  lng: -89.9970,
  chapter_id: 'ch-memphis',
};

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

(async () => {
  const auth = admin.auth();
  const db = admin.firestore();

  let user;
  try {
    user = await auth.getUserByEmail(SPEC.email);
    await auth.updateUser(user.uid, { password: SPEC.password, displayName: SPEC.name });
    console.log(`Auth user existed → password reset.   uid: ${user.uid}`);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    user = await auth.createUser({
      email: SPEC.email,
      password: SPEC.password,
      displayName: SPEC.name,
    });
    console.log(`Created new auth user.                 uid: ${user.uid}`);
  }

  // users/{uid} doc — mirror the schema the app expects.
  const userDoc = {
    id: user.uid,
    email: SPEC.email,
    name: SPEC.name,
    role: 'restaurant',
    phone: SPEC.phone,
    phone_normalized: normalizePhone(SPEC.phone),
    city: SPEC.city,
    state: SPEC.state,
    zip: SPEC.zip,
    chapter_id: SPEC.chapter_id,
    business_name: SPEC.name,
    restaurant_id: user.uid,
    address: SPEC.address,
    lat: SPEC.lat,
    lng: SPEC.lng,
    profile_complete: true,
    referral_code: 'BNTEST01',
    referrals_count: 0,
    referred_by: null,
    events_attended: 0,
    hours_logged: 0,
    meals_rescued: 0,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('users').doc(user.uid).set(userDoc, { merge: true });

  // A matching restaurants/{uid} doc so the createPickup enrichment can
  // pull the address from a real partner doc later, not just the user.
  await db.collection('restaurants').doc(user.uid).set({
    id: user.uid,
    name: SPEC.name,
    business_name: SPEC.name,
    address: SPEC.address,
    city: SPEC.city,
    state: SPEC.state,
    zip: SPEC.zip,
    lat: SPEC.lat,
    lng: SPEC.lng,
    chapter_id: SPEC.chapter_id,
    status: 'approved',
    owner_uid: user.uid,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('\nFirestore docs written: users/' + user.uid + ', restaurants/' + user.uid);
  console.log('\n--- Login credentials ---');
  console.log('Email:    ' + SPEC.email);
  console.log('Password: ' + SPEC.password);
  console.log('-------------------------\n');
  console.log('Go to app.betternatureofficial.org → Sign In → use those credentials.');
  console.log('After signing in you should land directly in the restaurant portal.');
  process.exit(0);
})().catch((e) => {
  console.error('Failed:', e?.message || e);
  process.exit(1);
});
