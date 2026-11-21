// Server-side logic behind the locked-down collections, run against the
// same local Firestore emulator (admin SDK — bypasses rules).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { pickupCompleted, eventCheckedIn, volunteerSignedUp } = require('./impactCounters.js');
const { mirrorPublicProfile } = require('./publicProfiles.js');

const PROJECT_ID = 'demo-bn-functions';
let app;
let db;

before(() => {
  app = initializeApp({ projectId: PROJECT_ID }, 'functions-test');
  db = getFirestore(app);
});
after(async () => { await deleteApp(app); });

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
});

const stats = async () => (await db.doc('org_stats/global').get()).data() || {};

describe('impact counters', () => {
  it('a completed pickup adds lbs, derived meals/co2/water, hours and one event', async () => {
    await pickupCompleted(db, 'p1', { status: 'enroute' }, { status: 'completed', actual_weight_lbs: 20, hours_earned: 1.5 });
    const s = await stats();
    assert.equal(s.lbs, 20);
    assert.equal(s.meals, 24);
    assert.equal(s.co2, 76);
    assert.equal(s.water, 3500);
    assert.equal(s.hours, 1.5);
    assert.equal(s.events, 1);
  });

  it('the same pickup is only counted once (function retries)', async () => {
    const before = { status: 'enroute' };
    const after = { status: 'completed', actual_weight_lbs: 20, hours_earned: 1 };
    await pickupCompleted(db, 'p1', before, after);
    await pickupCompleted(db, 'p1', before, after);
    assert.equal((await stats()).lbs, 20);
  });

  it('edits to an already-completed pickup do not count again', async () => {
    await pickupCompleted(db, 'p1', { status: 'completed' }, { status: 'completed', actual_weight_lbs: 20 });
    assert.equal((await stats()).lbs, undefined);
  });

  it('negative or junk weights are ignored', async () => {
    await pickupCompleted(db, 'p2', { status: 'enroute' }, { status: 'completed', actual_weight_lbs: -500, hours_earned: 'x' });
    const s = await stats();
    assert.equal(s.lbs, undefined);
    assert.equal(s.events, 1);
  });

  it('an event check-in adds meals, hours and one event', async () => {
    await eventCheckedIn(db, 'a1', { source_type: 'event_checkin', meals: 10, hours: 2 });
    const s = await stats();
    assert.deepEqual([s.meals, s.hours, s.events], [10, 2, 1]);
  });

  it('pickup activity rows are not double-counted as check-ins', async () => {
    await eventCheckedIn(db, 'pickup_p1', { source_type: 'pickup_complete', meals: 24 });
    assert.equal((await stats()).meals, undefined);
  });

  it('member signups count as volunteers; restaurants do not', async () => {
    await volunteerSignedUp(db, 'u1', { role: 'member' });
    await volunteerSignedUp(db, 'u1', { role: 'member' });
    await volunteerSignedUp(db, 'r1', { role: 'restaurant' });
    assert.equal((await stats()).volunteers, 1);
  });
});

describe('public profile mirror', () => {
  it('copies only the safe fields', async () => {
    await mirrorPublicProfile(db, 'u1', null, {
      name: 'Ada', chapter_id: 'ch-a', leaderboard_score: 40,
      email: 'ada@example.org', phone: '555', address: '1 Main', push_tokens: ['t'], onesignal_player_id: 'p',
    });
    const p = (await db.doc('public_profiles/u1').get()).data();
    assert.equal(p.name, 'Ada');
    assert.equal(p.leaderboard_score, 40);
    for (const k of ['email', 'phone', 'address', 'push_tokens', 'onesignal_player_id']) assert.equal(p[k], undefined, k);
  });

  it('removes the mirror when a member is deleted or disabled', async () => {
    await mirrorPublicProfile(db, 'u1', null, { name: 'Ada' });
    await mirrorPublicProfile(db, 'u1', { name: 'Ada' }, { name: 'Ada', disabled: true });
    assert.equal((await db.doc('public_profiles/u1').get()).exists, false);
  });

  it('credits the inviter once when referred_by first appears', async () => {
    await db.doc('users/inviter').set({ name: 'Inviter', referrals_count: 0 });
    await mirrorPublicProfile(db, 'u2', { name: 'New' }, { name: 'New', referred_by: 'inviter' });
    await mirrorPublicProfile(db, 'u2', { name: 'New', referred_by: 'inviter' }, { name: 'New 2', referred_by: 'inviter' });
    assert.equal((await db.doc('users/inviter').get()).data().referrals_count, 1);
  });
});
