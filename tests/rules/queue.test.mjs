// Coordinator exception queue (functions/lib/rescueQueue.js) and the
// custody-candidates callable.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { buildQueue } = require('./lib/rescueQueue.js');

const MIN = 60_000;
const NOW = Date.parse('2026-11-21T18:00:00Z');
const at = (m) => new Date(NOW + m * MIN).toISOString();
const dest = (pickupMin, arrivalMin) => ({ site_name: 'S', pickup_by: at(pickupMin), arrival_by: at(arrivalMin) });

describe('rescue queue', () => {
  const pickups = [
    { id: 'healthy', status: 'available', destination_confirmation: dest(120, 180), dispatch: { status: 'searching', round: 1 } },
    { id: 'nosite', status: 'pending_destination', pickup_window_until: at(90) },
    { id: 'closing', status: 'available', destination_confirmation: dest(20, 60), dispatch: { status: 'searching', round: 2 } },
    { id: 'escalated', status: 'available', destination_confirmation: dest(25, 60),
      dispatch: { status: 'escalated', escalation: { reason: 'no_acceptance' } } },
    { id: 'late', status: 'claimed', claimant_name: 'Vic', destination_confirmation: dest(-5, 40) },
    { id: 'held', status: 'enroute', verified_by_restaurant_at: at(-20), safety_hold: { reason: 'cannot_continue' },
      destination_confirmation: dest(-30, 30) },
    { id: 'rejected', status: 'enroute', verified_by_restaurant_at: at(-20), destination_confirmation: dest(-30, 30),
      receiving_receipt: { weight_lbs: 20, rejected_weight_lbs: 10 } },
    { id: 'receipt', status: 'enroute', verified_by_restaurant_at: at(-20), destination_confirmation: dest(-30, 30) },
    { id: 'overdue', status: 'enroute', verified_by_restaurant_at: at(-60), destination_confirmation: dest(-90, -10) },
    { id: 'donor', status: 'claimed', destination_confirmation: dest(15, 60) },
    { id: 'done', status: 'completed' },
  ];

  it('orders by urgency and explains owner, next step and deadline', () => {
    const { items, healthy } = buildQueue(pickups, NOW);
    assert.deepEqual(items.map((i) => i.id),
      ['held', 'rejected', 'escalated', 'late', 'overdue', 'closing', 'nosite', 'receipt', 'donor']);
    assert.equal(healthy, 1);
    const late = items.find((i) => i.id === 'late');
    assert.equal(late.owner, 'Vic'); assert.match(late.next, /no-show/); assert.equal(late.minutesLeft, -5);
    assert.match(items.find((i) => i.id === 'held').next, /custody transfer/);
    assert.equal(items.find((i) => i.id === 'nosite').deadlineLabel, 'Donor cutoff');
    assert.equal(items.find((i) => i.id === 'closing').owner, 'Dispatch · round 2');
  });

  it('a late run after collection is never offered as a no-show release', () => {
    const { items } = buildQueue([{ id: 'x', status: 'claimed', verified_by_restaurant_at: at(-5), destination_confirmation: dest(-1, 30) }], NOW);
    assert.equal(items[0].kind, 'late_pickup'); assert.doesNotMatch(items[0].next, /no-show/);
  });

  it('accepts Firestore timestamps', () => {
    const ts = (m) => ({ toMillis: () => NOW + m * MIN });
    const { items } = buildQueue([{ id: 't', status: 'claimed', destination_confirmation: { pickup_by: ts(-1), arrival_by: ts(30) } }], NOW);
    assert.equal(items[0].kind, 'late_pickup');
  });
});

// ── custody candidates (emulator) ───────────────────────────────────
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { listCustodyCandidates } = require('./custodyCandidates.js');
const PROJECT_ID = 'demo-bn-queue';
let app, db;
before(() => { app = initializeApp({ projectId: PROJECT_ID }, 'queue-test'); db = getFirestore(app); });
after(async () => { await deleteApp(app); });

const ok = { role: 'member', chapter_id: 'ch', member_status: 'approved', verification_status: 'approved',
  contract_volunteer_signed: true, driver_setup_complete: true };
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    db.doc('users/pres').set({ ...ok, role: 'chapter_president', name: 'Pat' }),
    db.doc('users/otherpres').set({ ...ok, role: 'chapter_president', chapter_id: 'ch2' }),
    db.doc('users/alice').set({ ...ok, name: 'Alice', phone: '555-0001' }),
    db.doc('users/bob').set({ ...ok, name: 'Bob', phone: '555-0002' }),
    db.doc('users/carl').set({ ...ok, name: 'Carl' }),
    db.doc('users/nodriver').set({ ...ok, driver_setup_complete: false }),
    db.doc('users/far').set({ ...ok, chapter_id: 'ch2' }),
    db.doc('users/rest').set({ ...ok, role: 'restaurant' }),
    db.doc('users/site').set({ ...ok, name: 'Site desk' }),
    db.doc('pickups/p').set({ status: 'enroute', chapter_id: 'ch', claimed_by: 'alice', receiver_uid: 'site' }),
    db.doc('pickups/other').set({ status: 'claimed', chapter_id: 'ch', claimed_by: 'carl' }),
  ]);
});

describe('custody candidates callable', () => {
  it('only chapter coordinators can list candidates', async () => {
    await assert.rejects(listCustodyCandidates(db, { pickupId: 'p' }, 'bob'), /coordinators/);
    await assert.rejects(listCustodyCandidates(db, { pickupId: 'p' }, 'otherpres'), /coordinators/);
  });
  it('returns eligible chapter volunteers, excluding the claimant and receiver, busy last', async () => {
    const { candidates } = await listCustodyCandidates(db, { pickupId: 'p' }, 'pres');
    assert.deepEqual(candidates.map((c) => [c.id, c.busy]), [['bob', false], ['pres', false], ['carl', true]]);
    assert.equal(candidates[0].phone, '555-0002');
  });
});
