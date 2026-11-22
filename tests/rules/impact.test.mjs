// Reporting reconciliation (functions/lib/impactLedger.js + impactReports):
// each activity counted once; legacy profile differences explained, not added.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, describe, it } from 'node:test';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { reconcile, rollUp } = require('./lib/impactLedger.js');

const delivery = (id, lbs, hours) => ({ id: `pickup_${id}`, source_type: 'pickup_complete', source_id: id, lbs, meals: Math.round(lbs * 1.2), hours, events: 1 });
const checkin = (id, event, hours) => ({ id, source_type: 'event_checkin', source_id: event, hours, meals: 0, events: 1 });

describe('impact ledger', () => {
  it('counts each delivery, check-in and manual entry once; voids and duplicates are audited, not counted', () => {
    const out = reconcile({
      profile: { lbs_rescued: 50, hours_logged: 4, events_attended: 3, pickups_completed: 2, meals_rescued: 60 },
      activity: [delivery('a', 20, 1), delivery('b', 30, 1), checkin('checkin_e1_u', 'e1', 2),
        checkin('legacy_dup', 'e1', 2), { id: 'pickup_release_x', source_type: 'pickup_release', source_id: 'x', points: -5 },
        { ...delivery('c', 99, 9), voided: true }],
      manual: [{ id: 'm1', minutes: 90 }, { id: 'm2', minutes: 60, voided: true }],
    });
    assert.deepEqual(out.verified, { lbs: 50, meals: 60, hours: 5.5, deliveries: 2, events: 1 });
    assert.equal(out.audit.duplicates.length, 1);
    assert.equal(out.audit.voided.length, 2);
    assert.equal(out.audit.excluded[0].reason, 'release, points only');
    assert.deepEqual(out.differences, []);
  });

  it('explains a legacy profile counter instead of adding it', () => {
    const out = reconcile({ profile: { lbs_rescued: 120, hours_logged: 2, pickups_completed: 1, events_attended: 1, meals_rescued: 24 },
      activity: [delivery('a', 20, 1)], manual: [] });
    assert.equal(out.verified.lbs, 20);
    const lbs = out.differences.find((d) => d.field === 'lbs_rescued');
    assert.equal(lbs.difference, 100); assert.match(lbs.explanation, /Not included in verified totals/);
  });

  it('a duplicate completion event is counted once', () => {
    const out = reconcile({ profile: {}, activity: [delivery('a', 20, 1), { ...delivery('a', 20, 1), id: 'pickup_a_copy' }], manual: [] });
    assert.equal(out.verified.deliveries, 1); assert.equal(out.verified.lbs, 20);
  });

  it('chapter roll-up adds verified totals and lists members to review', () => {
    const a = reconcile({ profile: { lbs_rescued: 20, hours_logged: 1, pickups_completed: 1, events_attended: 1, meals_rescued: 24 }, activity: [delivery('a', 20, 1)], manual: [] });
    const b = reconcile({ profile: { lbs_rescued: 500 }, activity: [], manual: [{ id: 'm', minutes: 120 }] });
    const out = rollUp([{ id: 'a', name: 'A', result: a }, { id: 'b', name: 'B', result: b }]);
    assert.deepEqual(out.totals, { lbs: 20, meals: 24, hours: 3, deliveries: 1, events: 0 });
    assert.deepEqual(out.flagged.map((m) => m.id), ['b']);
  });
});

const admin = require('firebase-admin');
const PROJECT_ID = 'demo-bn-impact';
let db, R, counters;
before(() => { if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID }); db = admin.firestore(); R = require('./impactReports.js'); counters = require('./impactCounters.js'); });
after(async () => { await Promise.all(admin.apps.map((a) => a.delete())); });
beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all([
    db.doc('users/pres').set({ role: 'chapter_president', chapter_id: 'ch' }),
    db.doc('users/otherpres').set({ role: 'chapter_president', chapter_id: 'ch2' }),
    db.doc('users/val').set({ role: 'member', chapter_id: 'ch', name: 'Val', lbs_rescued: 20, hours_logged: 1, pickups_completed: 1, events_attended: 1, meals_rescued: 24 }),
    db.doc('member_activity/pickup_a').set((({ id, ...row }) => ({ user_id: 'val', ...row }))(delivery('a', 20, 1))),
    db.doc('users/val/manual_volunteer_work/m1').set({ minutes: 60, date: '2026-11-01', description: 'Sorting' }),
  ]);
});

describe('impact reports', () => {
  it('scope: chapter staff see their chapter; others are refused', async () => {
    const out = await R.volunteerImpact(db, { memberId: 'val' }, 'pres');
    assert.equal(out.verified.hours, 2);
    await assert.rejects(R.volunteerImpact(db, { memberId: 'val' }, 'otherpres'), /scope/);
    await assert.rejects(R.chapterImpact(db, { chapterId: 'ch' }, 'otherpres'), /your chapter/);
    const chapter = await R.chapterImpact(db, { chapterId: 'ch' }, 'pres');
    assert.equal(chapter.totals.lbs, 20);
  });

  it('a check-in applies profile and org counters exactly once, even if the trigger repeats', async () => {
    const row = { user_id: 'val', source_type: 'event_checkin', source_id: 'e1', hours: 2, meals: 0, events: 1 };
    await counters.eventCheckedIn(db, 'checkin_e1_val', row);
    await counters.eventCheckedIn(db, 'checkin_e1_val', row);
    const u = (await db.doc('users/val').get()).data();
    assert.equal(u.events_attended, 2); assert.equal(u.hours_logged, 3);
    assert.equal((await db.doc('org_stats/global').get()).data().events, 1);
  });
});
