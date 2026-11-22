// Recurring donations (functions/donationSchedules.js): recurrence, skips,
// daylight saving, duplicate-proof occurrences, donor confirmation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const S = require('./donationSchedules.js');

const base = { days: ['mon', 'wed', 'fri'], ready_time: '15:00', timezone: 'America/Chicago' };
const chicagoClock = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' });

describe('recurrence', () => {
  it('lists only scheduled weekdays, honoring skip dates and the end date', () => {
    const from = Date.parse('2026-11-23T00:00:00-06:00');       // Monday
    const to = Date.parse('2026-12-07T00:00:00-06:00');
    const occ = S.occurrencesBetween({ ...base, skip_dates: ['2026-11-27'], ends_on: '2026-12-02' }, from, to);
    assert.deepEqual(occ.map((o) => o.date), ['2026-11-23', '2026-11-25', '2026-11-30', '2026-12-02']);
    assert.ok(occ.every((o) => chicagoClock(o.readyAt).endsWith('3:00 PM')));
  });

  it('keeps the local ready time across daylight saving changes', () => {
    const spring = S.occurrencesBetween({ ...base, days: ['fri', 'mon'] }, Date.parse('2026-03-06T00:00:00Z'), Date.parse('2026-03-10T00:00:00Z'));
    assert.deepEqual(spring.map((o) => o.date), ['2026-03-06', '2026-03-09']);
    assert.ok(spring.every((o) => chicagoClock(o.readyAt).endsWith('3:00 PM')));
    assert.equal(spring[1].readyAt - spring[0].readyAt, (3 * 24 - 1) * 3600_000);   // one hour shorter across spring-forward
    const fall = S.occurrencesBetween({ ...base, days: ['fri', 'mon'] }, Date.parse('2026-10-30T00:00:00Z'), Date.parse('2026-11-03T00:00:00Z'));
    assert.ok(fall.every((o) => chicagoClock(o.readyAt).endsWith('3:00 PM')));
    assert.equal(fall[1].readyAt - fall[0].readyAt, (3 * 24 + 1) * 3600_000);
  });

  it('ignores schedules with an invalid time', () => {
    assert.deepEqual(S.occurrencesBetween({ ...base, ready_time: '25:00' }, Date.now(), Date.now() + 7 * 86400_000), []);
  });
});

const admin = require('firebase-admin');
const PROJECT_ID = 'demo-bn-schedules';
let db;
before(() => { if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID }); db = admin.firestore(); });
after(async () => { await Promise.all(admin.apps.map((a) => a.delete())); });

const MIN = 60_000;
let NOW, readyAt, date;
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  // A ready time two hours from a fixed "now", on that local weekday.
  NOW = Date.parse('2026-11-23T19:00:00Z');   // Mon 1:00 PM Chicago
  date = '2026-11-23'; readyAt = Date.parse('2026-11-23T21:00:00Z');
  await Promise.all([
    db.doc('restaurants/r1').set({ user_id: 'donor', name: 'Green Table', address: '123 Main', lat: 35.1495, lng: -90.049 }),
    db.doc('donation_schedules/s1').set({ ...base, restaurant_id: 'r1', chapter_id: 'ch', owner_uid: 'donor', status: 'active',
      window_hours: 3, template: { food_category: 'produce', packages: 4, estimated_weight_lbs: 25 },
      destination: { mode: 'network', offer_to_network: true } }),
  ]);
});

describe('occurrences', () => {
  it('materializes each occurrence once, even if the job runs twice', async () => {
    assert.equal((await S.materialize(db, { now: NOW })).created, 1);
    assert.equal((await S.materialize(db, { now: NOW + MIN })).created, 0);
    const occ = (await db.doc(`donation_occurrences/s1_${date}`).get()).data();
    assert.equal(occ.status, 'awaiting_donor'); assert.equal(occ.ready_at.toMillis(), readyAt);
    const notes = (await db.collection('notifications').get()).docs.map((d) => d.data());
    assert.equal(notes.length, 1); assert.equal(notes[0].user_id, 'donor');
  });

  it('paused schedules and skipped dates create nothing', async () => {
    await db.doc('donation_schedules/s1').update({ skip_dates: [date] });
    assert.equal((await S.materialize(db, { now: NOW })).created, 0);
    await db.doc('donation_schedules/s1').update({ skip_dates: [], status: 'paused' });
    assert.equal((await S.materialize(db, { now: NOW })).created, 0);
  });

  it('asks exactly three hours before the window starts, not earlier', async () => {
    assert.equal((await S.materialize(db, { now: readyAt - 3 * 60 * MIN - MIN })).created, 0);
    assert.equal((await S.materialize(db, { now: readyAt - 3 * 60 * MIN + MIN })).created, 1);
    const occ = (await db.doc(`donation_occurrences/s1_${date}`).get()).data();
    assert.equal(occ.confirm_requested_at.toMillis(), readyAt - 3 * 60 * MIN + MIN);
  });

  it('an occurrence first seen inside the lead time is requested immediately', async () => {
    assert.equal((await S.materialize(db, { now: readyAt - 30 * MIN })).created, 1);
    const notes = (await db.collection('notifications').get()).docs.map((d) => d.data().data?.type);
    assert.deepEqual(notes, ['donation_occurrence']);
  });

  it('unconfirmed occurrences are marked missed when their window ends, never dispatched', async () => {
    await S.materialize(db, { now: NOW });
    assert.equal((await S.materialize(db, { now: readyAt + 3 * 60 * MIN - MIN })).missed, 0);   // window is 3 h
    const out = await S.materialize(db, { now: readyAt + 3 * 60 * MIN + MIN });
    assert.equal(out.missed, 1);
    assert.equal((await db.doc(`donation_occurrences/s1_${date}`).get()).data().status, 'missed');
    assert.equal((await db.collection('pickups').get()).size, 0);
    assert.equal((await S.materialize(db, { now: readyAt + 4 * 60 * MIN })).missed, 0);          // rerun is a no-op
    await assert.rejects(S.confirmOccurrence(db, { occurrenceId: `s1_${date}`, estimated_weight_lbs: 10 }, 'donor', { now: readyAt + 4 * 60 * MIN }), /already handled/);
  });

  it('pausing or cancelling the schedule skips open occurrences and blocks confirmation', async () => {
    await S.materialize(db, { now: NOW });
    await db.doc('donation_schedules/s1').update({ status: 'paused' });
    await assert.rejects(S.confirmOccurrence(db, { occurrenceId: `s1_${date}`, estimated_weight_lbs: 10 }, 'donor', { now: NOW }), /paused or cancelled/);
    const out = await S.materialize(db, { now: NOW + MIN });
    assert.equal(out.skipped, 1);
    assert.equal((await db.doc(`donation_occurrences/s1_${date}`).get()).data().skip_reason, 'Schedule paused');
    await db.doc('donation_schedules/s1').update({ status: 'cancelled' });
    assert.equal((await S.materialize(db, { now: NOW + 2 * MIN })).created, 0);
  });

  it('the donor can edit this occurrence’s start time; the window follows it', async () => {
    await S.materialize(db, { now: NOW });
    const out = await S.confirmOccurrence(db, { occurrenceId: `s1_${date}`, estimated_weight_lbs: 12, start_time: '16:30', ready_for_hours: 1 }, 'donor', { now: NOW });
    const p = (await db.doc(`pickups/${out.pickupId}`).get()).data();
    assert.equal(Date.parse(p.scheduled_for), Date.parse('2026-11-23T22:30:00Z'));      // 4:30 PM Chicago
    assert.equal(Date.parse(p.pickup_window_until), Date.parse('2026-11-23T23:30:00Z'));
  });

  it('only the donor confirms; confirming creates one donation with measured-vs-estimate labels and asks partners', async () => {
    await S.materialize(db, { now: NOW });
    const id = `s1_${date}`;
    await assert.rejects(S.confirmOccurrence(db, { occurrenceId: id, estimated_weight_lbs: 20 }, 'stranger', { now: NOW }), /Only the donor/);
    const asked = [];
    const requestPartner = async (_db, req) => { asked.push(req); return { ok: true }; };
    const out = await S.confirmOccurrence(db, { occurrenceId: id, estimated_weight_lbs: 18, packages: 3, ready_for_hours: 2 }, 'donor', { now: NOW, requestPartner });
    const again = await S.confirmOccurrence(db, { occurrenceId: id, estimated_weight_lbs: 18, packages: 3 }, 'donor', { now: NOW, requestPartner });
    assert.equal(again.cached, true);
    const p = (await db.doc(`pickups/${out.pickupId}`).get()).data();
    assert.equal(p.status, 'pending_destination'); assert.equal(p.estimated_weight_lbs, 18); assert.equal(p.weight_basis, 'estimate');
    assert.equal(p.food_category, 'produce'); assert.equal(p.occurrence_id, id);
    assert.equal(Date.parse(p.pickup_window_until) - readyAt, 2 * 60 * MIN);
    assert.deepEqual(asked.map((a) => [a.pickupId, a.mode]), [[out.pickupId, 'network']]);
  });

  it('skipping is recorded and cannot later be confirmed', async () => {
    await S.materialize(db, { now: NOW });
    const id = `s1_${date}`;
    await S.confirmOccurrence(db, { occurrenceId: id, skip: true, reason: 'Closed for the holiday' }, 'donor', { now: NOW });
    assert.equal((await db.doc(`donation_occurrences/${id}`).get()).data().skip_reason, 'Closed for the holiday');
    await assert.rejects(S.confirmOccurrence(db, { occurrenceId: id, estimated_weight_lbs: 10 }, 'donor', { now: NOW }), /already handled/);
  });
});
