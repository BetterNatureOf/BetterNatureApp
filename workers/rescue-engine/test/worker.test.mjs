// The free rescue engine Worker end to end (Node, Firestore emulator):
// callable protocol over HTTP, auth, error mapping, CORS, the after-call
// work that replaced triggers, and the cron's polling and idempotency.
// Run: FIRESTORE_EMULATOR_HOST=… node -r ./workers/rescue-engine/test/use-shim.cjs --test workers/rescue-engine/test/worker.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { beforeEach, describe, it } from 'node:test';
import worker from '../src/index.mjs';

const require = createRequire(import.meta.url);
const { latLngToCell } = require('../../../functions/node_modules/h3-js');
const engine = require('../src/engine.js');

const PROJECT = 'demo-bn-worker';
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const env = { FIRESTORE_PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: HOST, FIREBASE_AUTH_EMULATOR_HOST: 'unused', MANUAL_TRIGGER_KEY: 'k' };
const MIN = 60_000;
const LAT = 35.1495, LNG = -90.049;
const db = engine.setup(env);
const { Timestamp } = require('../src/shim/firestore.js');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: uid,
  iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
async function call(name, data, uid, origin = 'http://localhost:8081') {
  const res = await worker.fetch(new Request(`https://engine.test/${name}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(uid ? { Authorization: `Bearer ${token(uid)}` } : {}) },
    body: JSON.stringify({ data }) }), env, ctx);
  await Promise.all(waits.splice(0));
  return { status: res.status, body: await res.json(), headers: res.headers };
}
const volunteer = (extra = {}) => ({ role: 'member', chapter_id: 'ch', member_status: 'approved', verification_status: 'approved', name: 'V',
  contract_volunteer_signed: true, driver_setup_complete: true, ...extra });

beforeEach(async () => {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const T = Date.now();
  await Promise.all([
    db.doc('users/val').set(volunteer({ name: 'Val' })),
    db.doc('users/vic').set(volunteer({ name: 'Vic' })),
    db.doc('restaurants/r1').set({ user_id: 'donor', name: 'Green Table', status: 'approved' }),
    db.doc('receiving_sites/site1').set({ name: 'Pantry', type: 'staffed_center', chapter_id: 'ch', status: 'active', lat: LAT + 0.02, lng: LNG }),
    db.doc('receiving_sites/site1/reservations/p').set({ pickup_id: 'p', status: 'held', expires_at: Timestamp.fromMillis(T + 240 * MIN) }),
    db.doc('rescue_availability/val').set({ cell: latLngToCell(LAT, LNG, 7), updated_at: Timestamp.fromMillis(T - MIN) }),
  ]);
  await db.doc('pickups/p').set({ status: 'available', chapter_id: 'ch', restaurant_id: 'r1', receiver_uid: 'site', claimed_by: null,
    restaurant_lat: LAT, restaurant_lng: LNG, fridge_lat: LAT + 0.02, fridge_lng: LNG, estimated_weight_lbs: 20,
    destination_confirmation: { site_name: 'Pantry', site_id: 'site1', confirmed_at: Timestamp.fromMillis(T - MIN),
      pickup_by: Timestamp.fromMillis(T + 120 * MIN), arrival_by: Timestamp.fromMillis(T + 180 * MIN) } });
});

describe('callable protocol', () => {
  it('answers CORS preflight for the app and not for other sites', async () => {
    const ok = await worker.fetch(new Request('https://engine.test/respondToRescueOffer', { method: 'OPTIONS', headers: { Origin: 'https://app.betternatureofficial.org' } }), env, ctx);
    assert.equal(ok.status, 204); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://app.betternatureofficial.org');
    const bad = await worker.fetch(new Request('https://engine.test/respondToRescueOffer', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env, ctx);
    assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
  });

  it('refuses unsigned-in and forged callers with Firebase-style errors', async () => {
    const anon = await call('respondToRescueOffer', { pickupId: 'p', response: 'accept' }, null);
    assert.equal(anon.status, 401); assert.equal(anon.body.error.status, 'UNAUTHENTICATED');
    const forged = await worker.fetch(new Request('https://engine.test/respondToRescueOffer', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not.a.token' }, body: '{"data":{}}' }), env, ctx);
    assert.equal(forged.status, 401);
  });

  it('a first claim opens dispatch through the after-call work, then a direct take is refused while the offer is live', async () => {
    // Nobody has opened dispatch yet; the cron's poll does it (as the trigger did).
    await call('pickupChanged', { pickupId: 'p' }, 'vic');
    const offers = (await db.collection('pickups/p/offers').get()).docs.map((d) => d.data());
    assert.deepEqual(offers.map((o) => [o.uid, o.status]), [['val', 'open']]);
    const taken = await call('respondToRescueOffer', { pickupId: 'p', response: 'accept' }, 'vic');
    assert.equal(taken.status, 400); assert.equal(taken.body.error.status, 'FAILED_PRECONDITION');
    assert.equal(taken.body.error.details.reason, 'offered_elsewhere');
  });

  it('the offered volunteer accepts over HTTP; the server records it and dispatch is assigned', async () => {
    await call('pickupChanged', { pickupId: 'p' }, 'val');
    const out = await call('respondToRescueOffer', { pickupId: 'p', response: 'accept' }, 'val');
    assert.equal(out.status, 200); assert.equal(out.body.result.accepted, true);
    const p = (await db.doc('pickups/p').get()).data();
    assert.equal(p.claimed_by, 'val'); assert.equal(p.claimed_via, 'offer'); assert.ok(p.updated_at);
    assert.equal((await db.doc('pickups/p/dispatch/state').get()).data().status, 'assigned');
  });

  it('unknown functions are 404', async () => {
    const out = await call('dropDatabase', {}, 'val');
    assert.equal(out.status, 404);
  });
});

describe('schedule', () => {
  it('polls changed pickups, records a release once and tells the donor once', async () => {
    await db.doc('pickups/p').update({ status: 'available', claimed_by: null, released_by: 'val', released_at: Timestamp.now(),
      updated_at: Timestamp.now() });
    const first = await worker.fetch(new Request('https://engine.test/tick?only=pickups', { method: 'POST', headers: { 'x-trigger-key': 'k' } }), env, ctx);
    assert.equal((await first.json()).pickups, 1);
    assert.equal((await db.collection('pickup_releases').get()).size, 1);
    assert.equal((await db.collection('notification_work').get()).size, 1);
    // The cursor moved, and handling again changes nothing.
    await engine.processPickup(db, 'p');
    assert.equal((await db.collection('pickup_releases').get()).size, 1);
    assert.equal((await db.collection('notification_work').get()).size, 1);
    assert.ok((await db.doc('engine_state/cursors').get()).data().pickups);
  });

  it('the manual tick needs the key', async () => {
    const res = await worker.fetch(new Request('https://engine.test/tick', { method: 'POST' }), env, ctx);
    assert.equal(res.status, 403);
  });

  it('settles a hold from current state: cancelling releases it', async () => {
    await db.doc('pickups/p').update({ status: 'cancelled' });
    await engine.processPickup(db, 'p');
    assert.equal((await db.doc('receiving_sites/site1/reservations/p').get()).data().status, 'released');
  });
});
