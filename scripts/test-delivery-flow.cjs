// Actual delivery service source + real client transactions + deployed rules.
// Run under the Firestore emulator on a demo project. No production fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('@babel/parser');
// Resolve firebase-admin from functions/package.json so this
// test and the function module share one SDK instance. See
// test-c1-complete.cjs for the same pattern.
const functionsRequire = require('node:module').createRequire(require.resolve('../functions/lib/pickupEligibility'));
const admin = functionsRequire('firebase-admin');
const F = require('firebase/firestore');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const eligibility = require('../functions/lib/pickupEligibility');
const projectId = process.env.GCLOUD_PROJECT || 'demo-a2';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo Firestore emulator required');
admin.initializeApp({ projectId });
const db = admin.firestore();
const source = fs.readFileSync(require.resolve('../src/services/database.js'), 'utf8');
const names = ['claimPickup','cancelClaim','cancelPickup','verifyPickupByRestaurant','setPickupEnroute',
  'handOffPickup','releaseAbandonedPickup','updatePickupFridge','createPickup'];
const ast = parser.parse(source, { sourceType: 'module' });
const declarations = ast.program.body.map((node) => node.declaration || node)
  .filter((node) => node.type === 'FunctionDeclaration' && names.includes(node.id.name));
assert.equal(declarations.length, names.length);
const actual = declarations.map((node) => source.slice(node.start, node.end)).join('\n').replace(/\bimport\(/g, 'loadModule(');
const approved = { role: 'member', name: 'Alice', phone: 'fixture-phone', member_status: 'approved',
  verification_status: 'approved', contract_volunteer_signed: true, driver_setup_complete: true };
const stamp = F.serverTimestamp;
let env, count = 0;
// A pending client SDK transaction must not let Node exit with a false pass.
const watchdog = setTimeout(() => {
  console.error('Delivery suite timed out before all cases completed'); process.exit(1);
}, 60000);
const profiles = new Map();
function client(uid) {
  if (!profiles.has(uid)) profiles.set(uid, env.authenticatedContext(uid, { email_verified: true }).firestore());
  return profiles.get(uid);
}
function service(uid) {
  const notices = [];
  const notify = new Proxy({}, { get: (_, name) => name === 'then' ? undefined
    : async (...args) => { notices.push({ name, args }); return { queued: 1 }; } });
  const deps = { ...F, db: client(uid), auth: { currentUser: { uid } }, useMock: () => false,
    isFirebaseConfigured: true, pickupEligibility: eligibility,
    loadModule: async (name) => name === './publicProfiles' ? { fetchPublicProfile: async () => ({ display_name: uid }) } : notify,
    console: { warn: () => {} } };
  const api = new Function(...Object.keys(deps), `${actual}; return { ${names.join(',')} };`)(...Object.values(deps));
  return { ...api, notices };
}
async function seed(pickup = {}, user = {}) {
  await env.clearFirestore();
  await Promise.all([
    db.doc('users/alice').set({ ...approved, ...user }),
    db.doc('users/bob').set({ ...approved, name: 'Bob' }),
    db.doc('users/eve').set({ ...approved, role: 'executive' }),
    db.doc('users/partner').set({ role: 'restaurant', restaurant_id: 'r', restaurant_status: 'approved' }),
    db.doc('users/foreign').set({ role: 'restaurant', restaurant_id: 'r', restaurant_status: 'approved' }),
    db.doc('restaurants/r').set({ user_id: 'partner', name: 'Food Partner', status: 'approved' }),
    db.doc('fridges/f').set({ name: 'Fixture Fridge', address: 'Fixture Destination', active: true, lat: 35, lng: -90 }),
    db.doc('pickups/p').set({ status: 'available', claimed_by: null, restaurant_id: 'r',
      chapter_id: 'chapter', estimated_weight_lbs: 20, ...pickup }),
  ]);
}
const read = async (path) => (await db.doc(path).get()).data();
async function test(name, fn) { watchdog.refresh(); await seed(); await fn(); console.log(`PASS ${++count}: ${name}`); }
const claimWrite = (uid, timestamp = stamp()) => F.updateDoc(F.doc(client(uid), 'pickups/p'), {
  status: 'claimed', claimed_by: uid, claimed_at: timestamp,
});
(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port),
    rules: fs.readFileSync(require.resolve('../firestore.rules'), 'utf8') } });
  try {
    await test('approved volunteer has self-profile access and can claim via SDK', async () => {
      await assertSucceeds(F.getDoc(F.doc(client('alice'),'users/alice')));
      await assertSucceeds(claimWrite('alice'));
    });
    await test('two real client claims produce one owner', async () => {
      const a = service('alice'), b = service('bob');
      const pair = await Promise.allSettled([a.claimPickup('p', 'alice'), b.claimPickup('p', 'bob')]);
      assert.equal(pair.filter((result) => result.status === 'fulfilled').length, 1);
      const pk = await read('pickups/p'); assert.ok(['alice','bob'].includes(pk.claimed_by));
      assert.equal(typeof pk.claimed_at.toMillis, 'function');
    });
    await test('claim replay does not reset timer or enqueue more notices', async () => {
      const a = service('alice'); await a.claimPickup('p','alice');
      const before = (await read('pickups/p')).claimed_at.toMillis(), notices = a.notices.length;
      const repeat = await a.claimPickup('p','alice');
      assert.equal(repeat.cached, true); assert.equal((await read('pickups/p')).claimed_at.toMillis(), before);
      assert.equal(a.notices.length, notices);
    });
    await test('claim replay cannot regress enroute to claimed', async () => {
      const a = service('alice'); await a.claimPickup('p','alice'); await a.setPickupEnroute('p');
      const repeat = await a.claimPickup('p','alice'); assert.equal(repeat.status, 'enroute');
      assert.equal((await read('pickups/p')).status, 'enroute');
    });
    await test('identity argument cannot impersonate another claimant', async () => {
      await assert.rejects(service('alice').claimPickup('p','bob'), /Sign in as/);
    });
    for (const [name, change] of Object.entries({ pending: { member_status:'pending' }, unverified:{verification_status:'pending'},
      unsigned:{contract_volunteer_signed:false}, no_driver:{driver_setup_complete:false}, disabled:{disabled:true},
      deleted:{deleted_at:'fixture-time'}, merged:{merged_into:'bob'}, rejected:{member_status:'rejected'},
      suspended:{member_status:'suspended'}, pending_business:{role:'restaurant',restaurant_status:'pending'} })) {
      await test(`raw SDK ${name} claimant denied and shared eligibility agrees`, async () => {
        const user = { ...approved, ...change }; await db.doc('users/alice').set(user);
        assert.equal(eligibility.pickupEligible(user), false); await assertFails(claimWrite('alice'));
        await assert.rejects(service('alice').claimPickup('p','alice'), /required to claim/);
      });
    }
    await test('executive cannot bypass missing personal approval while volunteering', async () => {
      await db.doc('users/eve').update({verification_status:'pending'}); await assertFails(claimWrite('eve'));
    });
    for (const role of ['executive','chapter_pres','chapter_vp','chapter_treas','chapter_vol_coord','chapter_sec']) {
      await test(`approved ${role} can volunteer with its own evidence`, async () => {
        const user = { ...approved, role, member_status:'pending' }; await db.doc('users/alice').set(user);
        assert.equal(eligibility.pickupEligible(user), true); await assertSucceeds(claimWrite('alice'));
      });
    }
    await test('approved business exemption agrees across policy and rules', async () => {
      const user={role:'restaurant',restaurant_status:'approved',member_status:'approved'};
      await db.doc('users/alice').set(user); assert.equal(eligibility.pickupEligible(user),true); await assertSucceeds(claimWrite('alice'));
    });
    await test('client-supplied claim clock denied', async () => {
      await assertFails(claimWrite('alice','2099-01-01T00:00:00Z'));
    });
    await test('non-approved food partner cannot publish or accept a claim', async () => {
      await db.doc('restaurants/r').update({status:'pending'}); await assertFails(claimWrite('alice'));
      await assertFails(F.setDoc(F.doc(client('partner'),'pickups/new'), {status:'available',restaurant_id:'r',estimated_weight_lbs:20}));
    });
    await test('forged profile restaurant pointer cannot impersonate its owner', async () => {
      await db.doc('pickups/p').update({status:'claimed',claimed_by:'alice'});
      await assertFails(F.updateDoc(F.doc(client('foreign'),'pickups/p'), {verified_by_restaurant_at:stamp(),verified_by_restaurant_uid:'foreign'}));
      await assertFails(F.setDoc(F.doc(client('foreign'),'pickups/new'), {status:'available',restaurant_id:'r',estimated_weight_lbs:20}));
    });
    await test('partner service publishes an available numeric-weight pickup', async () => {
      const out = await service('partner').createPickup({restaurant_id:'r',chapter_id:'chapter',estimated_weight_lbs:'20'});
      const pk=await read(`pickups/${out.id}`);assert.equal(pk.status,'available');assert.equal(pk.estimated_weight_lbs,20);
    });
    await test('partner or executive cannot seed claimed/verified/completed pickups', async () => {
      for (const uid of ['partner','eve']) for (const extra of [{status:'claimed',claimed_by:'alice'},
        {status:'completed'},{verified_by_restaurant_at:new Date().toISOString()},{enroute_at:new Date().toISOString()},
        {tax_receipt_id:'fabricated'},{hours_earned:9}]) {
        await assertFails(F.setDoc(F.doc(client(uid),'pickups/new'), {status:'available',restaurant_id:'r',estimated_weight_lbs:20,...extra}));
      }
    });
    await test('real release clears old contact snapshot and stamps current actor', async () => {
      const a=service('alice');await a.claimPickup('p','alice');await a.cancelClaim('p','Changed plans');
      const pk=await read('pickups/p');assert.equal(pk.status,'available');assert.equal(pk.claimant_name,null);
      assert.equal(pk.claimant_phone,null);assert.equal(pk.released_by,'alice');assert.equal(typeof pk.released_at.toMillis,'function');
      await service('bob').claimPickup('p','bob');assert.equal((await read('pickups/p')).claimed_by,'bob');
    });
    await test('real partner confirmation requires actual owner and server timestamp', async () => {
      await service('alice').claimPickup('p','alice');
      await assert.rejects(service('foreign').verifyPickupByRestaurant('p','foreign'), /Only the owner/);
      await service('partner').verifyPickupByRestaurant('p','partner');
      const pk=await read('pickups/p');assert.equal(pk.verified_by_restaurant_uid,'partner');assert.equal(typeof pk.verified_by_restaurant_at.toMillis,'function');
    });
    await test('available/unassigned pickup cannot be confirmed', async () => {
      await assertFails(F.updateDoc(F.doc(client('partner'),'pickups/p'), {verified_by_restaurant_at:stamp(),verified_by_restaurant_uid:'partner'}));
    });
    await test('confirmed handoff cannot be reset, rewritten, or cancelled', async () => {
      await service('alice').claimPickup('p','alice');await service('partner').verifyPickupByRestaurant('p','partner');
      await assert.rejects(service('alice').cancelClaim('p'),/Use volunteer handoff/);
      await assert.rejects(service('partner').cancelPickup('p'),/already picked up/);
      await assertFails(F.updateDoc(F.doc(client('partner'),'pickups/p'), {verified_by_restaurant_at:stamp(),verified_by_restaurant_uid:'partner'}));
      await assertFails(F.updateDoc(F.doc(client('partner'),'pickups/p'), {status:'cancelled',cancelled_at:stamp()}));
    });
    await test('spoofed verifier identity and timestamp denied', async () => {
      await service('alice').claimPickup('p','alice');
      await assertFails(F.updateDoc(F.doc(client('partner'),'pickups/p'), {verified_by_restaurant_at:stamp(),verified_by_restaurant_uid:'bob'}));
      await assertFails(F.updateDoc(F.doc(client('partner'),'pickups/p'), {verified_by_restaurant_at:'2099-01-01',verified_by_restaurant_uid:'partner'}));
    });
    await test('real start uses server clock; other volunteer cannot invoke cached start', async () => {
      await service('alice').claimPickup('p','alice');await service('alice').setPickupEnroute('p',{fridgeId:'f'});
      const pk=await read('pickups/p');assert.equal(typeof pk.enroute_at.toMillis,'function');assert.equal(pk.fridge_id,'f');
      await assert.rejects(service('bob').setPickupEnroute('p'), /Only the current volunteer/);
    });
    await test('forged enroute clock and lost eligibility are denied', async () => {
      await service('alice').claimPickup('p','alice');
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'), {status:'enroute',enroute_at:'2000-01-01'}));
      await db.doc('users/alice').update({disabled:true});
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'), {status:'enroute',enroute_at:stamp()}));
    });
    await test('partner cancellation is denied in transit, including raw SDK writes', async () => {
      await service('alice').claimPickup('p','alice');await service('alice').setPickupEnroute('p');
      await assert.rejects(service('partner').cancelPickup('p'), /already picked up/);
      await assertFails(F.updateDoc(F.doc(client('partner'),'pickups/p'), {status:'cancelled',cancelled_at:stamp()}));
      await assertFails(F.updateDoc(F.doc(client('eve'),'pickups/p'), {status:'cancelled',cancelled_at:stamp()}));
    });
    await test('partner cancellation before collection succeeds with server time', async () => {
      await service('partner').cancelPickup('p','Food no longer available');
      assert.equal((await read('pickups/p')).status,'cancelled');assert.equal(typeof (await read('pickups/p')).cancelled_at.toMillis,'function');
    });
    await test('real handoff preserves collection confirmation for the new volunteer', async () => {
      const a=service('alice');await a.claimPickup('p','alice');await service('partner').verifyPickupByRestaurant('p','partner');
      await a.setPickupEnroute('p');await a.handOffPickup('p','Vehicle issue');
      const before=await read('pickups/p');assert.equal(before.status,'available');assert.equal(before.handoff_from_uid,'alice');
      assert.ok(before.verified_by_restaurant_at);await service('bob').claimPickup('p','bob');await service('bob').setPickupEnroute('p');
      const after=await read('pickups/p');assert.equal(after.claimed_by,'bob');assert.ok(after.verified_by_restaurant_at);
      const { _complete } = require('../functions/completePickup');
      await _complete({ pickup_id:'p', actual_weight_lbs:20 }, {auth:{uid:'bob'}});
      assert.equal((await read('tax_receipts/rcpt_p')).volunteer_name,'Bob');
      assert.equal((await read('users/bob')).pickups_completed,1);
      assert.equal((await read('users/alice')).hours_logged,undefined);
      assert.equal((await read('pickups/p')).status,'completed');
    });
    await test('fridge changes only while enroute with server change time', async () => {
      await service('alice').claimPickup('p','alice');await assert.rejects(service('alice').updatePickupFridge('p','f'),/in progress/);
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'),{fridge_id:'f',fridge_changed_at:stamp()}));
      await service('alice').setPickupEnroute('p');await service('alice').updatePickupFridge('p','f');
      assert.equal(typeof (await read('pickups/p')).fridge_changed_at.toMillis,'function');
    });
    await test('executive abandonment release is narrow, stamped, and cannot discard collected food', async () => {
      await service('alice').claimPickup('p','alice');await service('eve').releaseAbandonedPickup('p');
      const pk=await read('pickups/p');assert.equal(pk.abandoned_by,'eve');assert.equal(pk.abandoned_prior_claimant,'alice');
      await service('alice').claimPickup('p','alice');await service('partner').verifyPickupByRestaurant('p','partner');
      await assert.rejects(service('eve').releaseAbandonedPickup('p'),/isn't a no-show/);
      await assertFails(F.updateDoc(F.doc(client('eve'),'pickups/p'), {status:'available',claimed_by:null}));
    });
    console.log(`Delivery lifecycle: all ${count} real-service/emulator cases passed`);
  } finally {clearTimeout(watchdog);await env.cleanup();await admin.app().delete();}
})().catch((error)=>{clearTimeout(watchdog);console.error(error);process.exitCode=1;});
