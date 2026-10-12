// Real Firestore transactions and real security rules, never an in-memory tx.
// firebase emulators:exec --only firestore --project demo-c1 'node scripts/test-c1-complete.cjs'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const functionsRequire = require('node:module').createRequire(require.resolve('../functions/completePickup'));
const admin = functionsRequire('firebase-admin');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const F = require('firebase/firestore');
const projectId = process.env.GCLOUD_PROJECT || 'demo-c1';
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith('demo-')) {
  throw new Error('This suite requires a demo project and FIRESTORE_EMULATOR_HOST. Never run against production.');
}
admin.initializeApp({ projectId });
const db = admin.firestore();
const { _complete: complete } = require('../functions/completePickup');
const { _dispatch: dispatch } = require('../functions/dispatchPickupCompletion');
const approved = { role: 'member', name: 'Alice', member_status: 'approved', verification_status: 'approved',
  contract_volunteer_signed: true, driver_setup_complete: true };
const ctx = (uid = 'alice') => ({ auth: { uid, token: { email_verified: true } } });
const payload = (extra = {}) => ({ pickup_id: 'p', actual_weight_lbs: 20, ...extra });
const send = (extra = {}, uid = 'alice') => complete(payload(extra), ctx(uid));
const read = async (path) => (await db.doc(path).get()).data();
const has = async (path) => (await db.doc(path).get()).exists;
const rejection = (code) => (e) => e.code === code;
let env, passed = 0;

async function seed(pickup = {}, user = {}) {
  await env.clearFirestore();
  await Promise.all([
    db.doc('users/alice').set({ ...approved, ...user }),
    db.doc('users/bob').set({ ...approved, name: 'Bob' }),
    db.doc('users/eve').set({ ...approved, name: 'Executive', role: 'executive' }),
    db.doc('users/partner').set({ role: 'restaurant', restaurant_id: 'r', restaurant_status: 'approved' }),
    db.doc('restaurants/r').set({ user_id: 'partner', name: 'Food Partner' }),
    db.doc('restaurants/foreign').set({ user_id: 'foreign-owner', name: 'Other Partner' }),
    db.doc('pickups/p').set({ status: 'enroute', claimed_by: 'alice', restaurant_id: 'r',
      enroute_at: new Date(Date.now() - 1800000).toISOString(), verified_by_restaurant_at: new Date().toISOString(), ...pickup }),
    db.doc('org_stats/global').set({ lbs: 0, meals: 0, co2: 0, water: 0, hours: 0, events: 0 }),
  ]);
}
async function test(name, fn) {
  await seed();
  await fn();
  console.log(`PASS ${++passed}: ${name}`);
}
async function assertTotals(weight = 20, meals = 24, events = 1) {
  const user = await read('users/alice'), org = await read('org_stats/global');
  assert.equal(user.lbs_rescued, weight); assert.equal(user.meals_rescued, meals);
  assert.equal(user.events_attended, events); assert.equal(user.pickups_completed, events);
  assert.equal(user.points, weight ? 10 + Math.min(50, meals) : 0);
  assert.equal(user.leaderboard_score, user.points);
  assert.equal(org.lbs, weight); assert.equal(org.meals, meals); assert.equal(org.co2, weight * 3.8);
  assert.equal(org.water, weight * 175); assert.equal(org.events, events);
  assert.equal(org.hours, user.hours_logged);
  assert.equal((await read('member_activity/pickup_p')).hours, user.hours_logged);
}

(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port),
    rules: fs.readFileSync(require.resolve('../firestore.rules'), 'utf8') } });
  try {
    await test('normal delivery atomically records canonical accounting and receipt schema', async () => {
      const out = await send(); assert.equal(out.cached, false); await assertTotals();
      const rec = await read('tax_receipts/rcpt_p'), pk = await read('pickups/p');
      assert.equal(rec.org.legalName, 'BetterNature Inc.'); assert.equal(rec.org.ein, '99-4028399');
      assert.equal(rec.receipt_no, out.receipt_no); assert.equal(rec.volunteer_name, 'Alice');
      assert.equal(rec.restaurant_name, 'Food Partner'); assert.equal(pk.tax_receipt_id, out.receipt_id);
      assert.ok(pk.tax_receipt_url.endsWith('id=rcpt_p')); assert.equal(pk.delivered_visible_to_restaurant, true);
      assert.equal((await read('audit_events/pickup_p')).actor_uid, 'alice');
      assert.equal((await read('pickup_completions/p')).notification_keys.length, 2);
    });
    await test('concurrent delivery and conflicting replay apply one frozen outcome', async () => {
      const pair = await Promise.all([send(), send()]); assert.equal(pair.filter((r) => r.cached).length, 1);
      const replay = await send({ actual_weight_lbs: 999, spoiled: true });
      assert.equal(replay.actual_weight_lbs, 20); assert.equal(replay.spoiled, false); await assertTotals();
    });
    await test('unrelated member cannot access a cached completion', async () => {
      await send(); await assert.rejects(send({}, 'bob'), rejection('permission-denied'));
    });
    await test('ordinary claimant cannot claim executive override', async () => {
      await assert.rejects(send({ override: true, override_reason: 'bypass' }), rejection('permission-denied'));
      assert.equal((await read('pickups/p')).status, 'enroute');
    });
    for (const [name, change] of Object.entries({ missing: null, disabled: { disabled: true }, deleted: { deleted: true },
      soft_deleted: { deleted_at: new Date().toISOString() }, merged: { merged_into: 'bob' }, pending: { member_status: 'pending' }, unverified: { verification_status: 'pending' },
      unsigned: { contract_volunteer_signed: false }, no_driver: { driver_setup_complete: false } })) {
      await test(`normal ${name} account denied`, async () => {
        if (!change) await db.doc('users/alice').delete(); else await db.doc('users/alice').update(change);
        await assert.rejects(send()); assert.equal(await has('pickup_completions/p'), false);
      });
    }
    await test('executive can volunteer as the actual claimant', async () => {
      await db.doc('users/eve').update({ member_status: admin.firestore.FieldValue.delete() });
      await db.doc('pickups/p').update({ claimed_by: 'eve' }); await send({}, 'eve');
      assert.equal((await read('tax_receipts/rcpt_p')).volunteer_name, 'Executive');
      assert.equal((await read('users/eve')).pickups_completed, 1);
    });
    await test('pending business approval cannot borrow its default approved member status', async () => {
      await db.doc('users/alice').update({ role: 'restaurant', restaurant_status: 'pending' });
      await assert.rejects(send(), rejection('failed-precondition'));
    });
    await test('approved food partner can handle a pickup under its business approval', async () => {
      await db.doc('users/alice').update({ role: 'restaurant', restaurant_status: 'approved', verification_status: 'none',
        contract_volunteer_signed: false, driver_setup_complete: false });
      await send(); await assertTotals();
    });
    await test('executive acting for another volunteer requires an explicit reason', async () => {
      await assert.rejects(send({}, 'eve'), rejection('permission-denied'));
      await assert.rejects(send({ override: true }, 'eve'), rejection('permission-denied'));
      await send({ override: true, override_reason: 'Delivery confirmed by officer' }, 'eve');
      assert.equal((await read('tax_receipts/rcpt_p')).volunteer_name, 'Alice');
      const audit = await read('audit_events/pickup_p'); assert.equal(audit.actor_uid, 'eve');
      assert.equal(audit.claimant_uid, 'alice'); assert.ok(audit.override_reason); await assertTotals();
    });
    await test('revoked executive role cannot use a stale override', async () => {
      await db.doc('users/eve').update({ role: 'member' });
      await assert.rejects(send({ override: true, override_reason: 'stale privilege' }, 'eve'), rejection('permission-denied'));
      assert.equal(await has('pickup_completions/p'), false);
    });
    await test('unclaimed override has a universal sentinel and no invented volunteer hours', async () => {
      await db.doc('pickups/p').update({ claimed_by: null, status: 'available' });
      const args = { override: true, override_reason: 'Staff delivery entered by executive' };
      const out = await Promise.all([send(args, 'eve'), send(args, 'eve')]);
      assert.equal(out.filter((r) => r.cached).length, 1); assert.equal(await has('member_activity/pickup_p'), false);
      assert.equal((await read('org_stats/global')).lbs, 20); assert.equal((await read('org_stats/global')).hours, 0);
    });
    await test('spoiled concurrent completion and replay have zero rescue credit and no receipt', async () => {
      const pair = await Promise.all([send({ spoiled: true }), send({ spoiled: true })]);
      assert.equal(pair.filter((r) => r.cached).length, 1); await assertTotals(0, 0, 0);
      assert.equal(await has('tax_receipts/rcpt_p'), false); assert.equal((await send({ spoiled: true })).cached, true);
      assert.equal((await read('notification_work/completion:p:partner')).data.type, 'pickup_spoiled');
    });
    await test('legacy completion fails explicitly without recounting', async () => {
      await db.doc('pickups/p').update({ status: 'completed' });
      await assert.rejects(send(), (e) => e.details.reason === 'legacy_completion');
      assert.equal((await read('org_stats/global')).lbs, 0);
    });
    await test('handoff note is returned as a recoverable screen reason and frozen into receipt', async () => {
      await db.doc('pickups/p').update({ verified_by_restaurant_at: admin.firestore.FieldValue.delete() });
      await assert.rejects(send(), (e) => e.details.reason === 'handoff_not_confirmed');
      await send({ unverified_note: 'Staff handed food over; phone was unavailable.' });
      assert.equal((await read('tax_receipts/rcpt_p')).handoff_unverified, true);
      assert.ok((await read('tax_receipts/rcpt_p')).handoff_unverified_note.includes('Staff'));
    });
    for (const value of [0, -1, null, '20', Infinity, NaN]) {
      await test(`invalid actual weight ${String(value)} denied even for exec override`, async () => {
        await assert.rejects(send({ actual_weight_lbs: value, override: true, override_reason: 'audit' }, 'eve'), rejection('invalid-argument'));
      });
    }
    const required = ['pickups/p', 'member_activity/pickup_p', 'users/alice', 'tax_receipts/rcpt_p', 'org_stats/global',
      'audit_events/pickup_p', 'notification_work/completion:p:partner', 'pickup_completions/p'];
    for (const path of required) {
      await test(`failure writing ${path} rolls back every completion artifact`, async () => {
        const original = db.runTransaction;
        db.runTransaction = (fn, options) => original.call(db, (tx) => fn(new Proxy(tx, {
          get(target, prop) {
            const method = target[prop];
            if (['create', 'set', 'update'].includes(prop)) return (ref, ...args) => {
              if (ref.path === path) throw new Error('injected required write failure');
              return method.call(target, ref, ...args);
            };
            return typeof method === 'function' ? method.bind(target) : method;
          },
        })), options);
        try { await assert.rejects(send(), /injected required write failure/); } finally { db.runTransaction = original; }
        assert.equal((await read('pickups/p')).status, 'enroute'); assert.equal((await read('org_stats/global')).lbs, 0);
        for (const absent of ['member_activity/pickup_p', 'tax_receipts/rcpt_p', 'pickup_completions/p', 'audit_events/pickup_p',
          'notification_work/completion:p:volunteer', 'notification_work/completion:p:partner']) assert.equal(await has(absent), false);
        assert.equal((await read('users/alice')).lbs_rescued, undefined);
      });
    }
    await test('different concurrent pickups retain distinct receipt identities and aggregate totals', async () => {
      await db.doc('pickups/q').set(await read('pickups/p'));
      const [a, b] = await Promise.all([send(), complete({ ...payload(), pickup_id: 'q' }, ctx())]);
      assert.notEqual(a.receipt_no, b.receipt_no); assert.equal((await read('org_stats/global')).lbs, 40);
      assert.equal((await read('users/alice')).pickups_completed, 2);
    });
    await test('frozen notification work survives client disappearance and server replay preserves read/sent state', async () => {
      await send(); const snap = await db.doc('pickup_completions/p').get();
      await dispatch(snap);
      const bells = await db.collection('notifications').get(), outbox = await db.collection('notifications_outbox').get();
      assert.equal(bells.size, 2); assert.equal(outbox.size, 2);
      await bells.docs[0].ref.update({ read: true }); await outbox.docs[0].ref.update({ sent: true, status: 'sent', channels_done: ['email'] });
      await db.doc('notification_work/completion:p:partner').update({ status: 'pending' });
      await db.doc('notification_work/completion:p:volunteer').update({ status: 'pending' });
      await dispatch(snap);
      assert.equal((await bells.docs[0].ref.get()).data().read, true);
      assert.equal((await outbox.docs[0].ref.get()).data().status, 'sent');
      assert.equal((await db.collection('notifications_outbox').get()).size, 2);
      assert.equal((await read('notification_work/completion:p:partner')).status, 'completed');
    });
    await test('failed fanout leaves durable work and a trigger retry repairs the missing half', async () => {
      await send(); const snap = await db.doc('pickup_completions/p').get();
      const prototype = Object.getPrototypeOf(db.doc('notifications_outbox/example'));
      const original = prototype.create;
      prototype.create = function (value) {
        if (this.path.startsWith('notifications_outbox/')) throw new Error('injected outbox failure');
        return original.call(this, value);
      };
      try { await assert.rejects(dispatch(snap), /injected outbox failure/); } finally { prototype.create = original; }
      assert.equal((await db.collection('notifications').get()).size, 1);
      assert.equal((await db.collection('notifications_outbox').get()).size, 0);
      assert.equal((await read('notification_work/completion:p:volunteer')).status, 'pending');
      await dispatch(snap);
      assert.equal((await db.collection('notifications').get()).size, 2);
      assert.equal((await db.collection('notifications_outbox').get()).size, 2);
      assert.equal((await read('notification_work/completion:p:partner')).status, 'completed');
    });
    for (const uid of ['alice', 'partner', 'eve']) {
      await test(`${uid} cannot directly complete/create completed pickup or forge receipt`, async () => {
        const client = env.authenticatedContext(uid, { email_verified: true }).firestore();
        await assertFails(F.updateDoc(F.doc(client, 'pickups/p'), { status: 'completed' }));
        await assertFails(F.setDoc(F.doc(client, 'pickups/new'), { status: 'completed', restaurant_id: 'r' }));
        await assertFails(F.setDoc(F.doc(client, 'tax_receipts/extra'), { pickup_id: 'p', restaurant_id: 'foreign', weight_lbs: 999 }));
        await assertFails(F.setDoc(F.doc(client, 'pickup_completions/p'), { result: {} }));
        await assertFails(F.setDoc(F.doc(client, 'member_activity/pickup_p'), { user_id: uid, hours: 99 }));
        await assertFails(F.setDoc(F.doc(client, 'audit_events/pickup_p'), { actor_uid: uid }));
      });
    }
    await test('unrelated executive administration still allowed before completion', async () => {
      const client = env.authenticatedContext('eve').firestore();
      await assertSucceeds(F.updateDoc(F.doc(client, 'pickups/p'), { internal_notes: 'Check delivery' }));
      await assertSucceeds(F.setDoc(F.doc(client, 'member_activity/event_checkin'), { user_id: 'alice', hours: 1 }));
    });
    await test('partner receipt list is scoped to its owned restaurant', async () => {
      await send(); const client = env.authenticatedContext('partner').firestore();
      const own = await assertSucceeds(F.getDocs(F.query(F.collection(client, 'tax_receipts'), F.where('restaurant_id', '==', 'r'))));
      assert.equal(own.size, 1);
      await db.doc('tax_receipts/foreign_receipt').set({ restaurant_id: 'foreign', weight_lbs: 5 });
      await assertFails(F.getDocs(F.query(F.collection(client, 'tax_receipts'), F.where('restaurant_id', '==', 'foreign'))));
      await assertFails(F.getDocs(F.collection(client, 'tax_receipts')));
    });
    console.log(`C1: all ${passed} emulator cases passed`);
  } finally { await env.cleanup(); await admin.app().delete(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
