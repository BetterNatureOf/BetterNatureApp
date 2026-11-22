// Donor → receiving partner requests (functions/partnerRequests.js):
// preferred partner with response deadline and donor's network choice,
// network acceptance, concurrent capacity, expiry. Emulator, demo project.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const PROJECT_ID = 'demo-bn-partners';
let db, P, T0;
const MIN = 60_000;
before(() => { if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID }); db = admin.firestore(); P = require('./partnerRequests.js'); });
after(async () => { await Promise.all(admin.apps.map((a) => a.delete())); });

const allWeek = Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map((d) => [d, [{ open: '00:00', close: '23:59' }]]));
const site = (receiver, extra = {}) => ({ name: `Site ${receiver}`, type: 'staffed_center', chapter_id: 'ch', timezone: 'America/Chicago',
  hours: allWeek, status: 'active', food_categories: ['produce'], capacity: { packages_per_day: 5 }, receiver_uid: receiver, ...extra });
const pickup = (extra = {}) => ({ status: 'pending_destination', chapter_id: 'ch', restaurant_id: 'r1', claimed_by: null,
  estimated_weight_lbs: 20, packages: 4, food_category: 'produce', restaurant_name: 'Green Table',
  pickup_window_until: new Date(T0 + 120 * MIN).toISOString(), ...extra });
const notes = async (type) => (await db.collection('notifications').get()).docs.filter((d) => d.data().data?.type === type).map((d) => d.data().user_id).sort();

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  T0 = Date.now();
  await Promise.all([
    db.doc('users/donor').set({ role: 'restaurant', chapter_id: 'ch' }),
    db.doc('users/pres').set({ role: 'chapter_president', chapter_id: 'ch' }),
    db.doc('users/deskA').set({ role: 'member', chapter_id: 'ch' }),
    db.doc('users/deskB').set({ role: 'member', chapter_id: 'ch' }),
    db.doc('users/stranger').set({ role: 'member', chapter_id: 'ch' }),
    db.doc('restaurants/r1').set({ user_id: 'donor', status: 'approved' }),
    db.doc('receiving_sites/A').set(site('deskA')),
    db.doc('receiving_sites/B').set(site('deskB')),
    db.doc('pickups/p1').set(pickup()),
    db.doc('pickups/p2').set(pickup({ packages: 3 })),
  ]);
});

const ask = (id, extra) => P.requestPartner(db, { pickupId: id, mode: 'preferred', siteId: 'A', respondWithinMin: 30, ...extra }, 'donor', { now: T0 });

describe('preferred partner requests', () => {
  it('only the donor can ask, and the partner is notified', async () => {
    await assert.rejects(P.requestPartner(db, { pickupId: 'p1', mode: 'preferred', siteId: 'A' }, 'stranger', { now: T0 }), /Only the donor/);
    const out = await ask('p1');
    assert.ok(out.respond_by);
    const req = (await db.doc('pickups/p1').get()).data().partner_request;
    assert.equal(req.status, 'awaiting_partner'); assert.equal(req.offer_to_network, false);
    assert.deepEqual(await notes('partner_request'), ['deskA']);
  });

  it('a preference is not acceptance: only the requested partner (or a coordinator) can accept', async () => {
    await ask('p1');
    await assert.rejects(P.respondPartner(db, { pickupId: 'p1', response: 'accept', siteId: 'B', arrivalBy: T0 + 180 * MIN }, 'deskB', { now: T0 + MIN }), /receiver/);
    assert.equal((await db.doc('pickups/p1').get()).data().status, 'pending_destination');
    const out = await P.respondPartner(db, { pickupId: 'p1', response: 'accept', arrivalBy: T0 + 180 * MIN }, 'deskA', { now: T0 + MIN });
    assert.equal(out.accepted, true);
    const p = (await db.doc('pickups/p1').get()).data();
    assert.equal(p.status, 'available'); assert.equal(p.destination_confirmation.site_id, 'A');
    assert.equal(p.partner_request.status, 'accepted'); assert.equal(p.receiver_uid, 'deskA');
    assert.equal((await db.doc('receiving_sites/A/reservations/p1').get()).data().status, 'held');
  });

  it('declined without network permission goes back to the donor', async () => {
    await ask('p1');
    const out = await P.respondPartner(db, { pickupId: 'p1', response: 'decline', reason: 'Walk-in cooler full' }, 'deskA', { now: T0 + MIN });
    assert.equal(out.next, 'declined');
    const req = (await db.doc('pickups/p1').get()).data().partner_request;
    assert.equal(req.status, 'declined'); assert.equal(req.history[0].reason, 'Walk-in cooler full');
    assert.deepEqual(await notes('partner_declined'), ['donor']);
  });

  it('declined with the donor’s permission moves to the partner network', async () => {
    await ask('p1', { offerToNetwork: true });
    const out = await P.respondPartner(db, { pickupId: 'p1', response: 'decline' }, 'deskA', { now: T0 + MIN });
    assert.equal(out.next, 'network');
    const req = (await db.doc('pickups/p1').get()).data().partner_request;
    assert.equal(req.mode, 'network'); assert.equal(req.status, 'awaiting_partner');
    // any chapter partner can now accept with their own site
    await P.respondPartner(db, { pickupId: 'p1', response: 'accept', siteId: 'B', arrivalBy: T0 + 180 * MIN }, 'deskB', { now: T0 + 2 * MIN });
    assert.equal((await db.doc('pickups/p1').get()).data().destination_confirmation.site_id, 'B');
  });

  it('no answer by the deadline follows the donor’s choice', async () => {
    await ask('p1', { offerToNetwork: true });
    await ask('p2');
    const out = await P.expirePartnerRequests(db, { now: T0 + 31 * MIN });
    assert.equal(out.moved, 2);
    assert.equal((await db.doc('pickups/p1').get()).data().partner_request.mode, 'network');
    assert.equal((await db.doc('pickups/p2').get()).data().partner_request.status, 'expired');
    assert.equal((await P.expirePartnerRequests(db, { now: T0 + 31 * MIN })).moved, 0);
  });

  it('a late acceptance after the response window is refused', async () => {
    await ask('p1');
    await assert.rejects(P.respondPartner(db, { pickupId: 'p1', response: 'accept', arrivalBy: T0 + 180 * MIN }, 'deskA', { now: T0 + 40 * MIN }),
      (e) => e.details?.reason === 'expired');
  });

  it('two donations claiming the same capacity concurrently: only one fits', async () => {
    await P.requestPartner(db, { pickupId: 'p1', mode: 'network' }, 'donor', { now: T0 });
    await P.requestPartner(db, { pickupId: 'p2', mode: 'network' }, 'donor', { now: T0 });
    const results = await Promise.allSettled([
      P.respondPartner(db, { pickupId: 'p1', response: 'accept', siteId: 'A', arrivalBy: T0 + 180 * MIN }, 'deskA', { now: T0 + MIN }),
      P.respondPartner(db, { pickupId: 'p2', response: 'accept', siteId: 'A', arrivalBy: T0 + 180 * MIN }, 'deskA', { now: T0 + MIN }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.find((r) => r.status === 'rejected');
    assert.ok(rejected.reason.details?.reasons?.includes('over_package_capacity'));
    const held = (await db.collection('receiving_sites/A/reservations').get()).docs.filter((d) => d.data().status === 'held');
    assert.equal(held.length, 1);
  });

  it('donors only see active partners that can receive requests', async () => {
    await db.doc('receiving_sites/B').update({ status: 'paused' });
    const { sites } = await P.listPartnerSites(db, {}, 'donor');
    assert.deepEqual(sites.map((s) => s.id), ['A']);
    assert.equal(sites[0].receiver_uid, undefined);
  });
});
