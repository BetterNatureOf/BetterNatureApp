// Actual Auth -> HTTPS callable -> Firestore -> completion trigger -> A2 fanout.
// firebase emulators:exec --only auth,functions,firestore --project demo-c1 'node scripts/test-c1-callable.cjs'
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const projectId = process.env.GCLOUD_PROJECT || 'demo-c1';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Auth, Functions, and Firestore emulators on a demo project are required.');
}
admin.initializeApp({ projectId });
const db = admin.firestore();
const app = initializeApp({ projectId, apiKey: 'demo-key', appId: 'demo-c1' });
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const functions = getFunctions(app);
const functionHost = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const [host, port] = functionHost.split(':');
connectFunctionsEmulator(functions, host, Number(port));
(async () => {
  try {
    const { user } = await signInAnonymously(auth);
    await db.doc(`users/${user.uid}`).set({ role: 'member', name: 'Emulator Volunteer', member_status: 'approved',
      verification_status: 'approved', contract_volunteer_signed: true, driver_setup_complete: true });
    const id = `http-${Date.now()}`, restaurantId = `restaurant-${id}`;
    await db.doc(`users/partner-${id}`).set({ role: 'restaurant', name: 'Emulator Partner' });
    await db.doc(`restaurants/${restaurantId}`).set({ name: 'Emulator Food Partner', user_id: `partner-${id}` });
    await db.doc(`pickups/${id}`).set({ status: 'enroute', restaurant_id: restaurantId, claimed_by: user.uid,
      enroute_at: new Date(Date.now() - 1800000).toISOString(), verified_by_restaurant_at: new Date().toISOString() });
    const complete = httpsCallable(functions, 'completePickupOperation');
    const first = (await complete({ pickup_id: id, actual_weight_lbs: 20 })).data;
    assert.equal(first.ok, true); assert.equal(first.cached, false);
    const replay = (await complete({ pickup_id: id, actual_weight_lbs: 99 })).data;
    assert.equal(replay.cached, true); assert.equal(replay.actual_weight_lbs, 20);
    assert.equal((await db.doc(`users/${user.uid}`).get()).data().pickups_completed, 1);
    const keys = (await db.doc(`pickup_completions/${id}`).get()).data().notification_keys;
    const deadline = Date.now() + 30000;
    let completed = false;
    while (Date.now() < deadline) {
      const works = await Promise.all(keys.map((key) => db.doc(`notification_work/${key}`).get()));
      if (works.every((snap) => snap.data().status === 'completed')) { completed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(completed, 'Registered completion trigger must finish both frozen notification jobs');
    const recipientIds = [user.uid, `partner-${id}`];
    for (let i = 0; i < keys.length; i++) {
      const base = `${keys[i]}__${recipientIds[i]}`;
      assert.equal((await db.doc(`notifications/${base}__inapp`).get()).exists, true);
      assert.equal((await db.doc(`notifications_outbox/${base}__outbox`).get()).exists, true);
    }
    console.log('C1 callable: real authenticated HTTPS request, cached replay, and registered trigger fanout passed');
  } finally { await deleteApp(app); await admin.app().delete(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
