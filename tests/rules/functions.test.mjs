// Server-side logic behind the locked-down collections, run against the
// same local Firestore emulator (admin SDK — bypasses rules).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { eventCheckedIn, volunteerSignedUp } = require('./impactCounters.js');
const { creditReferral } = require('./referralCredit.js');

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

describe('referral credit', () => {
  it('credits the inviter once when referred_by first appears, even on retries', async () => {
    await db.doc('users/inviter').set({ name: 'Inviter', referrals_count: 0 });
    await creditReferral(db, 'u2', { name: 'New' }, { name: 'New', referred_by: 'inviter' });
    await creditReferral(db, 'u2', { name: 'New' }, { name: 'New', referred_by: 'inviter' });
    await creditReferral(db, 'u2', { name: 'New', referred_by: 'inviter' }, { name: 'New 2', referred_by: 'inviter' });
    assert.equal((await db.doc('users/inviter').get()).data().referrals_count, 1);
  });

  it('ignores self-referrals and unknown inviters', async () => {
    assert.equal(await creditReferral(db, 'u3', null, { referred_by: 'u3' }), false);
    assert.equal(await creditReferral(db, 'u4', null, { referred_by: 'ghost' }), false);
  });
});
