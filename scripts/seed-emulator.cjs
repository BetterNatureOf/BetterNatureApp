// Seeds the LOCAL Firebase emulators with a small Memphis rescue scene
// for browser testing (`npm run emulators`, then `npm run seed:emulators`,
// then `npm run web:emulators`). Refuses to run against anything but a
// demo-* project on the emulators, so it can never touch production.
//
// Every account below uses the local-only test password DEMO_PASSWORD.
const { createRequire } = require('node:module');
const functionsRequire = createRequire(require.resolve('../functions/package.json'));
const admin = functionsRequire('firebase-admin');
const { Timestamp } = functionsRequire('firebase-admin/firestore');
const { latLngToCell } = functionsRequire('h3-js');

const projectId = process.env.GCLOUD_PROJECT || 'demo-bn-local';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to seed: needs a demo-* project and both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.');
}
admin.initializeApp({ projectId });
const db = admin.firestore();
const auth = admin.auth();

const DEMO_PASSWORD = 'rescue-demo-123';
const CHAPTER = 'ch-memphis';
const MIN = 60_000;
const now = Date.now();
const ts = (offsetMin) => Timestamp.fromMillis(now + offsetMin * MIN);
const cell = (lat, lng, res = 8) => latLngToCell(lat, lng, res);

// Signed role agreements (ContractGate) so screens open directly.
const signed = (name) => ({ signed: true, signed_name: name, version: 1, signed_at: ts(-60 * 24) });
const approvedVolunteer = {
  contract_volunteer: signed('Demo volunteer'),
  role: 'member', chapter_id: CHAPTER, chapter_name: 'Memphis', member_status: 'approved',
  verification_status: 'approved', contract_volunteer_signed: true, driver_setup_complete: true,
  profile_complete: true, notif_pickup: true, push_enabled: false,
};
const PEOPLE = {
  coordinator: { email: 'coordinator@demo.betternature.test', name: 'Casey Coordinator',
    profile: { ...approvedVolunteer, role: 'chapter_president', contract_executive: signed('Casey Coordinator') } },
  // Val has no vehicle on file (shows the "unknown" path); Vic has a car without a cooler.
  volunteer: { email: 'volunteer@demo.betternature.test', name: 'Val Volunteer', profile: { ...approvedVolunteer, phone: '555-0101' } },
  volunteer2: { email: 'volunteer2@demo.betternature.test', name: 'Vic Volunteer', profile: { ...approvedVolunteer, phone: '555-0102',
    vehicle: { type: 'car', package_capacity: 6, weight_capacity_lbs: 150, equipment: [] } } },
  receiver: { email: 'pantry@demo.betternature.test', name: 'Pat at Mid-South Pantry',
    profile: { role: 'member', chapter_id: CHAPTER, member_status: 'approved', profile_complete: true } },
  donor: { email: 'donor@demo.betternature.test', name: 'Dana at Green Table',
    profile: { role: 'restaurant', chapter_id: CHAPTER, restaurant_id: 'r-green-table', restaurant_status: 'approved',
      business_name: 'Green Table Kitchen', member_status: 'approved', profile_complete: true,
      contract_restaurant: signed('Dana'), contract_restaurant_signed: true } },
  exec: { email: 'exec@demo.betternature.test', name: 'Eli Executive',
    profile: { ...approvedVolunteer, role: 'executive', contract_executive: signed('Eli Executive') } },
};

async function upsertUser(key, { email, name, profile }) {
  let user;
  try { user = await auth.getUserByEmail(email); } catch { user = null; }
  if (!user) user = await auth.createUser({ uid: key, email, password: DEMO_PASSWORD, displayName: name, emailVerified: true });
  await db.doc(`users/${user.uid}`).set({ email, name, full_name: name, created_at: ts(-60 * 24 * 30), ...profile });
  return user.uid;
}

const DONOR = { lat: 35.1495, lng: -90.049, address: '123 Main St, Memphis, TN' };
const SITE = { site_name: 'Mid-South Pantry', address: '239 S Dudley St, Memphis, TN', contact: 'Pat · 901-555-0140' };

function destination(pickupByMin, arrivalByMin) {
  return { ...SITE, confirmed_by: 'coordinator', confirmed_at: ts(-30), accepted_weight_lbs: 30,
    pickup_by: ts(pickupByMin), arrival_by: ts(arrivalByMin) };
}

function pickup(extra) {
  return {
    restaurant_id: 'r-green-table', restaurant_name: 'Green Table Kitchen', chapter_id: CHAPTER, chapter_name: 'Memphis',
    restaurant_address: DONOR.address, restaurant_lat: DONOR.lat, restaurant_lng: DONOR.lng,
    restaurant_h3: cell(DONOR.lat, DONOR.lng), restaurant_phone: '901-555-0199', restaurant_contact_name: 'Dana',
    estimated_weight_lbs: 30, meals_estimate: 36, food_category: 'prepared_cold', packages: 4, notes: 'Two trays of roasted vegetables and rice. Bring a cooler bag.',
    pickup_window_until: new Date(now + 120 * MIN).toISOString(), created_at: ts(-45), claimed_by: null,
    ...extra,
  };
}

(async () => {
  const uid = {};
  for (const [key, person] of Object.entries(PEOPLE)) uid[key] = await upsertUser(key, person);
  await db.doc(`chapters/${CHAPTER}`).set({ name: 'Memphis', city: 'Memphis', state: 'TN', status: 'active' });
  await db.doc('restaurants/r-green-table').set({ user_id: uid.donor, name: 'Green Table Kitchen', status: 'approved',
    chapter_id: CHAPTER, address: DONOR.address, lat: DONOR.lat, lng: DONOR.lng, phone: '901-555-0199' });
  // Volunteers who shared their area for nearby alerts (res-7 cell, fresh).
  await db.doc(`rescue_availability/${uid.volunteer}`).set({ cell: latLngToCell(35.152, -90.045, 7), updated_at: ts(-2) });
  await db.doc(`rescue_availability/${uid.volunteer2}`).set({ cell: latLngToCell(35.13, -90.02, 7), updated_at: ts(-2) });

  const pickups = {
    'demo-awaiting-site': pickup({ status: 'pending_destination', notes: 'Bread and pastries from today.' }),
    'demo-open': pickup({ status: 'available', destination_confirmation: destination(110, 170), receiver_uid: uid.receiver }),
    'demo-closing-soon': pickup({ status: 'available', restaurant_name: 'Green Table Kitchen (side door)',
      destination_confirmation: destination(25, 70), receiver_uid: uid.receiver }),
    'demo-claimed': pickup({ status: 'claimed', claimed_by: uid.volunteer2, claimed_at: ts(-20), claimant_name: 'Vic Volunteer',
      destination_confirmation: destination(40, 100), receiver_uid: uid.receiver }),
    'demo-awaiting-receipt': pickup({ status: 'enroute', claimed_by: uid.volunteer2, claimed_at: ts(-50), enroute_at: ts(-30),
      claimant_name: 'Vic Volunteer', verified_by_restaurant_at: ts(-25), verified_by_restaurant_uid: uid.donor,
      destination_confirmation: destination(60, 90), receiver_uid: uid.receiver }),
  };
  for (const [id, data] of Object.entries(pickups)) await db.doc(`pickups/${id}`).set(data);
  console.log(`Seeded ${projectId}: ${Object.keys(PEOPLE).length} accounts, ${Object.keys(pickups).length} rescues.`);
  console.log('Sign in with any of:', Object.values(PEOPLE).map((p) => p.email).join(', '));
  await admin.app().delete();
})().catch((error) => { console.error(error); process.exitCode = 1; });
