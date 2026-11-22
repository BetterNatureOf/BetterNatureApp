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
// Claims are server-only now: the client service calls respondToRescueOffer,
// whose real implementation runs here against the same emulator.
const { respond } = require('../functions/rescueOffers');
const projectId = process.env.GCLOUD_PROJECT || 'demo-a2';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Demo Firestore emulator required');
admin.initializeApp({ projectId });
const db = admin.firestore();
const source = fs.readFileSync(require.resolve('../src/services/database.js'), 'utf8');
const names = ['claimPickup','cancelClaim','cancelPickup','verifyPickupByRestaurant','setPickupEnroute',
  'releaseAbandonedPickup','updatePickupFridge','createPickup','confirmPickupDestination','recordPickupReceipt',
  'holdPickup','closeHeldPickup','transferPickupCustody','canTakeCustody','releasedPickupStatus','notifyDonorOfRelease'];
// The real rescue-cell helpers (ES module) compiled for this CJS harness.
const babel = require('@babel/core');
function loadEsm(file, requireMap) {
  const code = babel.transformSync(fs.readFileSync(require.resolve(file), 'utf8'),
    { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, (name) => require(requireMap[name] || name));
  return mod.exports;
}
const cells = loadEsm('../src/services/rescueCells.js', { './h3': 'h3-js' });
const ast = parser.parse(source, { sourceType: 'module' });
const declarations = ast.program.body.map((node) => node.declaration || node)
  .filter((node) => node.type === 'FunctionDeclaration' && names.includes(node.id.name));
assert.equal(declarations.length, names.length);
const actual = declarations.map((node) => source.slice(node.start, node.end)).join('\n').replace(/\bimport\(/g, 'loadModule(');
const approved = { role: 'member', name: 'Alice', phone: 'fixture-phone', member_status: 'approved', chapter_id: 'chapter',
  verification_status: 'approved', contract_volunteer_signed: true, driver_setup_complete: true };
const HOUR = 3600000;
const at = (ms) => admin.firestore.Timestamp.fromMillis(Date.now() + ms);
// Offer with a confirmed receiving site (the normal rescue path).
const destination = () => ({ site_name: 'Fixture Pantry', site_id: 'site1', address: 'Fixture Site', contact: 'Fixture desk',
  confirmed_by: 'pres', confirmed_at: at(-HOUR), accepted_weight_lbs: 20, pickup_by: at(2 * HOUR), arrival_by: at(3 * HOUR) });
// Pre-destination offers created before the receiving-site workflow.
const LEGACY = { destination_confirmation: null, receiver_uid: null };
// A legacy run already claimed before the receiving-site workflow.
const LEGACY_CLAIMED = () => ({ ...LEGACY, status: 'claimed', claimed_by: 'alice', claimed_at: at(-HOUR) });
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
    rescueCell: cells.rescueCell, pickupDeadline: cells.pickupDeadline, firebaseApp: {},
    pickupChanged: () => {},
    respondToRescue: async (pickupId, response) => {
      try { return await respond(db, { pickupId, response }, uid, { advance: async () => {} }); }
      catch (e) { throw new Error(e.message); }
    },
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
    db.doc('users/pres').set({ ...approved, name: 'Pat', role: 'chapter_president' }),
    db.doc('users/otherpres').set({ ...approved, name: 'Olu', role: 'chapter_president', chapter_id: 'other' }),
    db.doc('users/far').set({ ...approved, name: 'Far', chapter_id: 'other' }),
    db.doc('users/site').set({ role: 'member', name: 'Pantry desk', member_status: 'approved', chapter_id: 'chapter' }),
    db.doc('users/partner').set({ role: 'restaurant', restaurant_id: 'r', restaurant_status: 'approved' }),
    db.doc('users/foreign').set({ role: 'restaurant', restaurant_id: 'r', restaurant_status: 'approved' }),
    db.doc('restaurants/r').set({ user_id: 'partner', name: 'Food Partner', status: 'approved' }),
    db.doc('fridges/f').set({ name: 'Fixture Fridge', address: 'Fixture Destination', active: true, lat: 35, lng: -90 }),
    db.doc('receiving_sites/site1').set({ name: 'Fixture Pantry', type: 'staffed_center', chapter_id: 'chapter', status: 'active', lat: 35.01, lng: -90 }),
    db.doc('receiving_sites/site1/reservations/p').set({ status: 'held', expires_at: at(4 * HOUR), collected: false }),
    ...['alice', 'bob', 'eve', 'far', 'site'].map((uid) => db.doc(`rescue_availability/${uid}`).set({ cell: '872659ae0ffffff', updated_at: at(-60000) })),
    db.doc('pickups/p').set({ status: 'available', claimed_by: null, restaurant_id: 'r',
      restaurant_lat: 35, restaurant_lng: -90, fridge_lat: 35.01, fridge_lng: -90,
      chapter_id: 'chapter', estimated_weight_lbs: 20, receiver_uid: 'site',
      pickup_window_until: new Date(Date.now() + 2 * HOUR).toISOString(),
      destination_confirmation: destination(), ...pickup }),
  ]);
}
const read = async (path) => (await db.doc(path).get()).data();
async function test(name, fn, pickup = {}) { watchdog.refresh(); await seed(pickup); await fn(); console.log(`PASS ${++count}: ${name}`); }
const claimWrite = (uid, timestamp = stamp()) => F.updateDoc(F.doc(client(uid), 'pickups/p'), {
  status: 'claimed', claimed_by: uid, claimed_at: timestamp,
});
(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port),
    rules: fs.readFileSync(require.resolve('../firestore.rules'), 'utf8') } });
  try {
    await test('approved volunteer has self-profile access; raw SDK claims are refused (server-only)', async () => {
      await assertSucceeds(F.getDoc(F.doc(client('alice'),'users/alice')));
      await assertFails(claimWrite('alice'));
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
        await assert.rejects(service('alice').claimPickup('p','alice'), /required/);
      });
    }
    await test('executive cannot bypass missing personal approval while volunteering', async () => {
      await db.doc('users/eve').update({verification_status:'pending'}); await assertFails(claimWrite('eve'));
    });
    for (const role of ['executive','chapter_pres','chapter_vp','chapter_treas','chapter_vol_coord','chapter_sec']) {
      await test(`approved ${role} can volunteer with its own evidence`, async () => {
        const user = { ...approved, role, member_status:'pending' }; await db.doc('users/alice').set(user);
        assert.equal(eligibility.pickupEligible(user), true); await assertFails(claimWrite('alice'));
      });
    }
    await test('approved business exemption agrees across policy and rules', async () => {
      const user={role:'restaurant',restaurant_status:'approved',member_status:'approved',chapter_id:'chapter'};
      await db.doc('users/alice').set(user); assert.equal(eligibility.pickupEligible(user),true); await assertFails(claimWrite('alice'));
    });
    await test('client-supplied claim clock denied', async () => {
      await assertFails(claimWrite('alice','2099-01-01T00:00:00Z'));
    });
    await test('non-approved food partner cannot publish or accept a claim', async () => {
      await db.doc('restaurants/r').update({status:'pending'}); await assertFails(claimWrite('alice'));
      await assertFails(F.setDoc(F.doc(client('partner'),'pickups/new'), {status:'pending_destination',restaurant_id:'r',estimated_weight_lbs:20}));
    });
    await test('forged profile restaurant pointer cannot impersonate its owner', async () => {
      await db.doc('pickups/p').update({status:'claimed',claimed_by:'alice'});
      await assertFails(F.updateDoc(F.doc(client('foreign'),'pickups/p'), {verified_by_restaurant_at:stamp(),verified_by_restaurant_uid:'foreign'}));
      await assertFails(F.setDoc(F.doc(client('foreign'),'pickups/new'), {status:'pending_destination',restaurant_id:'r',estimated_weight_lbs:20}));
    });
    await test('partner service publishes a numeric-weight pickup that waits for a receiving site', async () => {
      const out = await service('partner').createPickup({restaurant_id:'r',chapter_id:'chapter',estimated_weight_lbs:'20'});
      const pk=await read(`pickups/${out.id}`);assert.equal(pk.status,'pending_destination');assert.equal(pk.estimated_weight_lbs,20);
      await assertFails(F.setDoc(F.doc(client('partner'),'pickups/direct'), {status:'available',restaurant_id:'r',estimated_weight_lbs:20}));
    });
    await test('partner or executive cannot seed claimed/verified/completed pickups', async () => {
      for (const uid of ['partner','eve']) for (const extra of [{status:'claimed',claimed_by:'alice'},
        {status:'completed'},{verified_by_restaurant_at:new Date().toISOString()},{enroute_at:new Date().toISOString()},
        {tax_receipt_id:'fabricated'},{hours_earned:9}]) {
        await assertFails(F.setDoc(F.doc(client(uid),'pickups/new'), {status:'pending_destination',restaurant_id:'r',estimated_weight_lbs:20,...extra}));
      }
      for (const uid of ['partner','eve']) for (const extra of [{destination_confirmation:{site_name:'Fixture Pantry',address:'Fixture Site'}},{receiver_uid:'site'},
        {receiving_receipt:{weight_lbs:20}},{safety_hold:{reason:'cannot_continue'}},{custody_transfer:{to_uid:'bob'}}]) {
        await assertFails(F.setDoc(F.doc(client(uid),'pickups/new'), {status:'pending_destination',restaurant_id:'r',estimated_weight_lbs:20,...extra}));
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
      await assert.rejects(service('alice').cancelClaim('p'),/coordinator help/);
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
      await service('alice').setPickupEnroute('p',{fridgeId:'f'});
      const pk=await read('pickups/p');assert.equal(typeof pk.enroute_at.toMillis,'function');assert.equal(pk.fridge_id,'f');
      await assert.rejects(service('bob').setPickupEnroute('p'), /Only the current volunteer/);
    }, LEGACY_CLAIMED());
    await test('legacy offer without a saved receiving site cannot be claimed, and a typed-in destination no longer opens it', async () => {
      await assertFails(claimWrite('alice'));
      await assert.rejects(service('alice').claimPickup('p','alice'), /confirmed receiving site/);
      await assert.rejects(service('pres').confirmPickupDestination('p',{siteName:'Fixture Pantry',address:'Fixture Site',contact:'Desk',
        arrivalBy:Date.now() + 3 * HOUR}));
      await assert.rejects(service('alice').claimPickup('p','alice'), /confirmed receiving site/);
      assert.equal((await read('pickups/p')).claimed_by, null);
    }, LEGACY);
    await test('confirmed destination cannot be swapped for a fridge at start or mid-run', async () => {
      await service('alice').claimPickup('p','alice');
      await assert.rejects(service('alice').setPickupEnroute('p',{fridgeId:'f'}), /confirmed destination/);
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'), {status:'enroute',enroute_at:stamp(),fridge_id:'f',fridge_name:'X'}));
      await service('alice').setPickupEnroute('p');
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'),{fridge_id:'f',fridge_changed_at:stamp()}));
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
    await test('collected run: hold, coordinator custody transfer, receipt, completion credits the finisher', async () => {
      const a=service('alice');await a.claimPickup('p','alice');await service('partner').verifyPickupByRestaurant('p','partner');
      await a.setPickupEnroute('p');await a.holdPickup('p','cannot_continue');
      const held=await read('pickups/p');assert.equal(held.claimed_by,'alice');assert.equal(held.safety_hold.reason,'cannot_continue');
      // Held food never returns to the open queue and the driver cannot self-release it.
      await assert.rejects(a.cancelClaim('p'),/coordinator help/);
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'),{status:'available',claimed_by:null,handoff_from_uid:'alice',handoff_at:stamp()}));
      await assertFails(F.updateDoc(F.doc(client('bob'),'pickups/p'),{status:'claimed',claimed_by:'bob',claimed_at:stamp()}));
      await assert.rejects(service('otherpres').transferPickupCustody('p','alice','bob',held.safety_hold.reported_at));
      await assert.rejects(service('pres').transferPickupCustody('p','alice','far',held.safety_hold.reported_at));
      assert.equal((await read('pickups/p')).claimed_by,'alice');
      await service('pres').transferPickupCustody('p','alice','bob',held.safety_hold.reported_at);
      const moved=await read('pickups/p');assert.equal(moved.claimed_by,'bob');assert.equal(moved.safety_hold,null);
      assert.equal(moved.custody_transfer.from_uid,'alice');assert.ok(moved.verified_by_restaurant_at);
      const { _complete } = require('../functions/completePickup');
      await assert.rejects(_complete({ pickup_id:'p', actual_weight_lbs:20 }, {auth:{uid:'bob'}}),
        (e) => e.details?.reason === 'receipt_required');
      await assertFails(F.updateDoc(F.doc(client('bob'),'pickups/p'),{receiving_receipt:{receiver_name:'x',weight_lbs:20,recorded_by:'bob',recorded_at:stamp(),source:'receiving_site'}}));
      await service('site').recordPickupReceipt('p',{receiverName:'Pantry desk',weightLbs:18,fromReceivingSite:true});
      await assert.rejects(_complete({ pickup_id:'p', actual_weight_lbs:20 }, {auth:{uid:'bob'}}),
        (e) => e.details?.reason === 'weight_mismatch');
      await _complete({ pickup_id:'p', actual_weight_lbs:18 }, {auth:{uid:'bob'}});
      assert.equal((await read('tax_receipts/rcpt_p')).weight_lbs,18);
      assert.equal((await read('users/bob')).pickups_completed,1);
      assert.equal((await read('users/alice')).hours_logged,undefined);
      assert.equal((await read('pickups/p')).status,'completed');
    });
    await test('coordinator closes a held run with a recorded disposition', async () => {
      const a=service('alice');await a.claimPickup('p','alice');await a.holdPickup('p','food_concern');
      await assert.rejects(service('alice').closeHeldPickup('p','discarded'));
      await assert.rejects(service('otherpres').closeHeldPickup('p','discarded'));
      await service('pres').closeHeldPickup('p','returned_to_donor');
      const pk=await read('pickups/p');assert.equal(pk.status,'cancelled');
      assert.equal(pk.safety_resolution.outcome,'returned_to_donor');assert.equal(pk.safety_resolution.resolved_by,'pres');
    });
    await test('nobody opens an offer from the client; claims stay closed until a saved site is confirmed', async () => {
      await db.doc('pickups/p').update({ status:'pending_destination', destination_confirmation:null, receiver_uid:null });
      const later = Date.now() + 3 * HOUR;
      await assert.rejects(service('alice').confirmPickupDestination('p',{siteName:'S',address:'A',contact:'C',arrivalBy:later}));
      await assert.rejects(service('otherpres').confirmPickupDestination('p',{siteName:'S',address:'A',contact:'C',arrivalBy:later}));
      await assertFails(claimWrite('alice'));
      // Even the chapter coordinator can't open it from the client: saved
      // sites go through confirmRescueDestination (capacity hold).
      await assert.rejects(service('pres').confirmPickupDestination('p',{siteName:'Fixture Pantry',address:'Fixture Site',contact:'Desk',arrivalBy:later}));
      assert.equal((await read('pickups/p')).status,'pending_destination');
    });
    await test('chapter boundary, receiver, and closed windows block claims', async () => {
      await assertFails(claimWrite('far'));
      await assert.rejects(service('far').claimPickup('p','far'));
      await db.doc('users/site').set({ ...approved, name: 'Pantry desk' });
      await assertFails(claimWrite('site'));
      await db.doc('pickups/p').update({ 'destination_confirmation.pickup_by': at(-60000) });
      await assertFails(claimWrite('alice'));
      await assert.rejects(service('alice').claimPickup('p','alice'), /window has closed/);
    });
    await test('releasing after the pickup window closed cancels instead of reopening', async () => {
      await service('alice').claimPickup('p','alice');
      await db.doc('pickups/p').update({ 'destination_confirmation.pickup_by': at(-60000) });
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'),{status:'available',claimed_by:null,claimed_at:null,
        claimant_name:null,claimant_phone:null,released_by:'alice',released_at:stamp()}));
      const out=await service('alice').cancelClaim('p');assert.equal(out.status,'cancelled');
      const pk=await read('pickups/p');assert.equal(pk.status,'cancelled');assert.equal(pk.released_by,'alice');
      assert.equal(pk.cancel_reason,'Pickup window expired');
    });
    await test('fridge changes only while enroute with server change time', async () => {
      await assert.rejects(service('alice').updatePickupFridge('p','f'),/in progress/);
      await assertFails(F.updateDoc(F.doc(client('alice'),'pickups/p'),{fridge_id:'f',fridge_changed_at:stamp()}));
      await service('alice').setPickupEnroute('p');await service('alice').updatePickupFridge('p','f');
      assert.equal(typeof (await read('pickups/p')).fridge_changed_at.toMillis,'function');
    }, LEGACY_CLAIMED());
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
