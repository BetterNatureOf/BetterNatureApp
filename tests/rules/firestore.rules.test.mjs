// Firestore security rules tests.
//
// Run with:  npm run test:rules
// (starts the local Firestore emulator, runs this file, shuts it down —
// nothing touches the real Firebase project).
//
// Every test states the behavior we WANT. A failing test means the
// rules allow something they shouldn't (or block a real app flow).

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteField,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-bn-rules';
const HOUR = 60 * 60 * 1000;

let env;

// ── Cast ────────────────────────────────────────────────────────────
const CH_A = 'ch-a';
const CH_B = 'ch-b';

const approvedVolunteer = (chapter_id) => ({
  role: 'member',
  chapter_id,
  verification_status: 'approved',
  member_status: 'approved',
  contract_volunteer_signed: true,
  driver_setup_complete: true,
});

const USERS = {
  exec: { role: 'executive', chapter_id: CH_A },
  presA: { role: 'chapter_president', chapter_id: CH_A },
  presB: { role: 'chapter_president', chapter_id: CH_B },
  volA: approvedVolunteer(CH_A),
  volA2: approvedVolunteer(CH_A),
  volB: approvedVolunteer(CH_B),
  pendingVol: { ...approvedVolunteer(CH_A), verification_status: 'pending' },
  newbie: { role: 'member', chapter_id: null, verification_status: 'pending' },
  rest: { role: 'restaurant', chapter_id: CH_A, restaurant_id: 'r1', restaurant_status: 'approved' },
  restOther: { role: 'restaurant', chapter_id: CH_A, restaurant_id: 'r2' },
  receiver: { role: 'member', chapter_id: CH_A, member_status: 'active' },
};

const as = (uid, token = {}) => env.authenticatedContext(uid, token).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// ── Pickup fixtures ─────────────────────────────────────────────────
function destination() {
  return {
    site_name: 'Mid-South Food Bank',
    address: '239 S Dudley St',
    contact: '901-555-0100',
    confirmed_by: 'exec',
    confirmed_at: Timestamp.fromMillis(Date.now() - HOUR),
    accepted_weight_lbs: 40,
    pickup_by: Timestamp.fromMillis(Date.now() + 2 * HOUR),
    arrival_by: Timestamp.fromMillis(Date.now() + 3 * HOUR),
  };
}

const HOLD_AT = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
const HOLD = { reason: 'cannot_continue', reported_by: 'volA', reported_at: HOLD_AT };

function pickups() {
  const base = {
    restaurant_id: 'r1',
    estimated_weight_lbs: 40,
    chapter_id: CH_A,
    receiver_uid: 'receiver',
    destination_confirmation: destination(),
    claimed_by: null,
  };
  const collected = {
    ...base,
    status: 'enroute',
    claimed_by: 'volA',
    verified_by_restaurant_at: Timestamp.fromMillis(Date.now() - 30 * 60 * 1000),
    verified_by_restaurant_uid: 'rest',
  };
  return {
    pAvail: { ...base, status: 'available' },
    pClaimed: { ...base, status: 'claimed', claimed_by: 'volA' },
    pClaimedCollected: { ...collected, status: 'claimed' },
    pCollected: collected,
    pReceived: {
      ...collected,
      receiving_receipt: {
        receiver_name: 'Mid-South Food Bank', weight_lbs: 20,
        recorded_by: 'receiver', recorded_at: Timestamp.now(), source: 'receiving_site',
      },
    },
    pHeld: { ...collected, safety_hold: HOLD },
    pDone: { ...collected, status: 'completed', actual_weight_lbs: 20 },
  };
}

// ── Lifecycle ───────────────────────────────────────────────────────
before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const writes = [
      ...Object.entries(USERS).map(([uid, data]) => setDoc(doc(db, 'users', uid), data)),
      ...Object.entries(pickups()).map(([id, data]) => setDoc(doc(db, 'pickups', id), data)),
      setDoc(doc(db, 'restaurants', 'r1'), { user_id: 'rest', status: 'approved' }),
      setDoc(doc(db, 'restaurants', 'r2'), { user_id: 'restOther', status: 'approved' }),
      setDoc(doc(db, 'chapters', CH_A), { name: 'Chapter A' }),
      setDoc(doc(db, 'chapters', CH_B), { name: 'Chapter B' }),
      setDoc(doc(db, 'events', 'evA'), { chapter_id: CH_A, title: 'Cleanup' }),
      setDoc(doc(db, 'donations', 'dB'), { user_id: 'volB', amount: 25 }),
      setDoc(doc(db, 'notifications', 'nB'), { user_id: 'volB', body: 'hi' }),
      setDoc(doc(db, 'rescue_availability', 'volB'), { cell: '872830828ffffff', updated_at: Timestamp.now() }),
      setDoc(doc(db, 'admin_invites', 'someone@example.org'), { code: 'SECRET1' }),
      setDoc(doc(db, 'org_stats', 'global'), { meals: 100, lbs: 80 }),
      setDoc(doc(db, 'org_units', CH_A), { type: 'chapter', name: 'Chapter A' }),
      setDoc(doc(db, 'public_profiles', 'volB'), { name: 'Vol B', chapter_id: CH_B }),
      setDoc(doc(db, 'pickups/pAvail/dispatch/state'), { status: 'searching', round: 1 }),
      setDoc(doc(db, 'pickups/pAvail/dispatch_alerts/g_volA'), { uid: 'volA' }),
    ];
    await Promise.all(writes);
  });
});

// ── Roles & privilege escalation ────────────────────────────────────
describe('roles: nobody can promote themselves', () => {
  it('member cannot set own role to executive', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'users/volA'), { role: 'executive' }));
  });

  it('member cannot add executive to own roles[]', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'users/volA'), { roles: ['executive'] }));
  });

  it('member cannot approve their own verification', async () => {
    await assertFails(updateDoc(doc(as('pendingVol'), 'users/pendingVol'), { verification_status: 'approved' }));
  });

  it('new signup cannot create a user doc as executive', async () => {
    await assertFails(setDoc(doc(as('mallory'), 'users/mallory'), { role: 'executive' }));
  });

  it('non-founder staff email cannot self-create as executive', async () => {
    const db = as('staff', { email: 'someone@betternatureofficial.org', email_verified: true });
    await assertFails(setDoc(doc(db, 'users/staff'), { role: 'executive' }));
  });

  it('new signup can create a plain member doc (positive control)', async () => {
    await assertSucceeds(setDoc(doc(as('mallory'), 'users/mallory'), { role: 'member', name: 'M' }));
  });

  it('member cannot write an executive role_assignment for themselves', async () => {
    await assertFails(setDoc(doc(as('volA'), 'role_assignments/volA_executive'), {
      user_id: 'volA', role_key: 'executive', status: 'active',
    }));
  });
});

// ── Chapter boundaries ──────────────────────────────────────────────
describe('chapters: presidents stay inside their own chapter', () => {
  it('president A cannot edit chapter B', async () => {
    await assertFails(updateDoc(doc(as('presA'), `chapters/${CH_B}`), { name: 'x' }));
  });

  it('president A can edit chapter A (positive control)', async () => {
    await assertSucceeds(updateDoc(doc(as('presA'), `chapters/${CH_A}`), { name: 'Chapter A!' }));
  });

  it('president A cannot create an event in chapter B', async () => {
    await assertFails(setDoc(doc(as('presA'), 'events/evX'), { chapter_id: CH_B, title: 'x' }));
  });

  it('president A cannot move an event into chapter B', async () => {
    await assertFails(updateDoc(doc(as('presA'), 'events/evA'), { chapter_id: CH_B }));
  });

  it('president A cannot announce to chapter B', async () => {
    await assertFails(setDoc(doc(as('presA'), 'announcements/a1'), { chapter_id: CH_B, body: 'x' }));
  });

  it('volunteer cannot move themselves into another chapter (must go through a join request)', async () => {
    await assertFails(updateDoc(doc(as('volB'), 'users/volB'), { chapter_id: CH_A }));
  });

  it('new member can pick their first chapter (positive control)', async () => {
    await assertSucceeds(updateDoc(doc(as('newbie'), 'users/newbie'), { chapter_id: CH_A }));
  });

  it('member cannot overwrite a chapter org_unit', async () => {
    await assertFails(setDoc(doc(as('volA'), `org_units/${CH_A}`), { type: 'chapter', name: 'pwned' }));
  });
});

// ── Pickup creation ─────────────────────────────────────────────────
describe('pickups: creation', () => {
  const draft = (extra = {}) => ({
    restaurant_id: 'r1', chapter_id: CH_A, status: 'pending_destination', claimed_by: null,
    estimated_weight_lbs: 40, ...extra,
  });

  it('restaurant can post its own pickup (positive control)', async () => {
    await assertSucceeds(setDoc(doc(as('rest'), 'pickups/new1'), draft()));
  });

  it('restaurant can include load details (food type, package count)', async () => {
    await assertSucceeds(setDoc(doc(as('rest'), 'pickups/new2'), draft({ food_category: 'prepared_cold', packages: 4 })));
  });

  it("restaurant cannot post a pickup under another restaurant's id", async () => {
    await assertFails(setDoc(doc(as('rest'), 'pickups/new1'), draft({ restaurant_id: 'r2' })));
  });

  it('restaurant cannot skip destination confirmation and post as available', async () => {
    await assertFails(setDoc(doc(as('rest'), 'pickups/new1'), draft({ status: 'available' })));
  });

  it('restaurant cannot pre-assign a volunteer', async () => {
    await assertFails(setDoc(doc(as('rest'), 'pickups/new1'), draft({ claimed_by: 'volA' })));
  });

  it('volunteer cannot post a pickup for a restaurant', async () => {
    await assertFails(setDoc(doc(as('volA'), 'pickups/new1'), draft()));
  });
});

// ── Claiming ────────────────────────────────────────────────────────
describe('pickups: claiming', () => {
  const claim = (uid) => ({
    status: 'claimed', claimed_by: uid, claimed_at: serverTimestamp(), claimant_name: uid,
  });
  // (claims also require an approved restaurant; seeded below)

  it('approved volunteer in the same chapter can claim (positive control)', async () => {
    await assertSucceeds(updateDoc(doc(as('volA'), 'pickups/pAvail'), claim('volA')));
  });

  it('volunteer from another chapter cannot claim', async () => {
    await assertFails(updateDoc(doc(as('volB'), 'pickups/pAvail'), claim('volB')));
  });

  it('unverified volunteer cannot claim', async () => {
    await assertFails(updateDoc(doc(as('pendingVol'), 'pickups/pAvail'), claim('pendingVol')));
  });

  it('donor cannot claim its own donation', async () => {
    await assertFails(updateDoc(doc(as('rest'), 'pickups/pAvail'), claim('rest')));
  });

  it('the receiving site cannot claim its own delivery', async () => {
    await assertFails(updateDoc(doc(as('receiver'), 'pickups/pAvail'), claim('receiver')));
  });

  it('volunteer cannot claim on behalf of someone else', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'pickups/pAvail'), claim('volA2')));
  });

  it("second volunteer cannot overwrite someone else's claim", async () => {
    await assertFails(updateDoc(doc(as('volA2'), 'pickups/pClaimed'), claim('volA2')));
  });

  it("other restaurant cannot cancel this restaurant's pickup", async () => {
    await assertFails(updateDoc(doc(as('restOther'), 'pickups/pAvail'), {
      status: 'cancelled', cancel_reason: 'x', cancelled_at: serverTimestamp(),
    }));
  });

  it('donor can cancel before collection (positive control)', async () => {
    await assertSucceeds(updateDoc(doc(as('rest'), 'pickups/pAvail'), {
      status: 'cancelled', cancel_reason: 'Changed plans', cancelled_at: serverTimestamp(),
    }));
  });
});

// ── Custody after collection ────────────────────────────────────────
describe('custody: collected food never goes back to the open queue', () => {
  it('volunteer cannot release a pickup back to available after collecting it', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'pickups/pClaimedCollected'), {
      status: 'available', claimed_by: null, claimed_at: null,
    }));
  });

  it('volunteer can release before collection (positive control)', async () => {
    await assertSucceeds(updateDoc(doc(as('volA'), 'pickups/pClaimed'), {
      status: 'available', claimed_by: null, claimed_at: null, claimant_name: null, claimant_phone: null,
      released_by: 'volA', released_at: serverTimestamp(),
    }));
  });

  it('donor cannot cancel once the food has been collected', async () => {
    await assertFails(updateDoc(doc(as('rest'), 'pickups/pClaimedCollected'), {
      status: 'cancelled', cancel_reason: 'x', cancelled_at: serverTimestamp(),
    }));
  });

  it('exec cannot silently swap the driver on a collected pickup', async () => {
    await assertFails(updateDoc(doc(as('exec'), 'pickups/pCollected'), { claimed_by: 'volA2' }));
  });

  it('exec cannot delete the receiving receipt', async () => {
    await assertFails(updateDoc(doc(as('exec'), 'pickups/pReceived'), { receiving_receipt: deleteField() }));
  });
});

// ── Receiving & completion ──────────────────────────────────────────
describe('receiving: only the receiving site confirms, weight must match', () => {
  const receipt = (uid) => ({
    receiving_receipt: {
      receiver_name: 'Mid-South Food Bank', weight_lbs: 20,
      recorded_by: uid, recorded_at: serverTimestamp(), source: 'receiving_site',
    },
  });
  const complete = (lbs) => ({
    status: 'completed', actual_weight_lbs: lbs, completed_at: new Date().toISOString(), hours_earned: 1,
  });

  it('receiving site can confirm the handoff (positive control)', async () => {
    const db = as('receiver', { email_verified: true });
    await assertSucceeds(updateDoc(doc(db, 'pickups/pCollected'), receipt('receiver')));
  });

  it('receiving site with unverified email cannot confirm', async () => {
    await assertFails(updateDoc(doc(as('receiver'), 'pickups/pCollected'), receipt('receiver')));
  });

  it('driver cannot write their own receiving receipt', async () => {
    const db = as('volA', { email_verified: true });
    await assertFails(updateDoc(doc(db, 'pickups/pCollected'), receipt('volA')));
  });

  it('driver cannot complete without a receiving receipt', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'pickups/pCollected'), complete(20)));
  });

  it('even with a receipt, completion is server-only (completePickupOperation)', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'pickups/pReceived'), complete(20)));
  });

  it('driver cannot inflate the weight past the receipt', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'pickups/pReceived'), complete(200)));
  });

  it("another volunteer cannot complete someone else's run", async () => {
    await assertFails(updateDoc(doc(as('volA2'), 'pickups/pReceived'), complete(20)));
  });
});

// ── Custody transfer ────────────────────────────────────────────────
describe('custody transfer: only the chapter president, only to an eligible volunteer', () => {
  const transfer = (by, to) => ({
    claimed_by: to,
    claimant_name: to,
    safety_hold: deleteField(),
    custody_transfer: {
      from_uid: 'volA', to_uid: to, recorded_by: by, recorded_at: serverTimestamp(), hold: HOLD,
    },
  });

  it('president A can hand a held run to another approved chapter A volunteer (positive control)', async () => {
    await assertSucceeds(updateDoc(doc(as('presA'), 'pickups/pHeld'), transfer('presA', 'volA2')));
  });

  it('president B cannot transfer custody on a chapter A run', async () => {
    await assertFails(updateDoc(doc(as('presB'), 'pickups/pHeld'), transfer('presB', 'volA2')));
  });

  it('president A cannot hand the run to a volunteer from chapter B', async () => {
    await assertFails(updateDoc(doc(as('presA'), 'pickups/pHeld'), transfer('presA', 'volB')));
  });

  it('president A cannot hand the run to an unverified volunteer', async () => {
    await assertFails(updateDoc(doc(as('presA'), 'pickups/pHeld'), transfer('presA', 'pendingVol')));
  });

  it('volunteer cannot transfer custody to a friend', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'pickups/pHeld'), transfer('volA', 'volA2')));
  });
});

// ── Data exposure ───────────────────────────────────────────────────
describe('privacy: people only see what is theirs', () => {
  it('signed-out visitor cannot read pickups', async () => {
    await assertFails(getDoc(doc(anon(), 'pickups/pAvail')));
  });

  it("member cannot read another member's donation", async () => {
    await assertFails(getDoc(doc(as('volA'), 'donations/dB')));
  });

  it("member cannot read another member's notifications", async () => {
    await assertFails(getDoc(doc(as('volA'), 'notifications/nB')));
  });

  it("member cannot read another volunteer's live location cell", async () => {
    await assertFails(getDoc(doc(as('volA'), 'rescue_availability/volB')));
  });

  it("member cannot read someone else's admin invite code", async () => {
    const db = as('volA', { email: 'vola@example.org', email_verified: true });
    await assertFails(getDoc(doc(db, 'admin_invites/someone@example.org')));
  });

  it("member cannot read another member's private profile (phone, address)", async () => {
    await assertFails(getDoc(doc(as('volA'), 'users/volB')));
  });
});

// ── Impact numbers & receipts ───────────────────────────────────────
describe('impact: numbers come from real completed work', () => {
  it('member cannot set the public meals counter to an arbitrary number', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'org_stats/global'), { meals: 999999999 }));
  });

  it('member cannot forge a member_activity row', async () => {
    await assertFails(setDoc(doc(as('volA'), 'member_activity/pickup_fake'), {
      user_id: 'volA', source_type: 'pickup_complete', source_id: 'fake', lbs: 1000,
    }));
  });

  it("volunteer cannot mint a tax receipt for a pickup they didn't deliver", async () => {
    await assertFails(setDoc(doc(as('volA2'), 'tax_receipts/t1'), { pickup_id: 'pDone', amount_lbs: 20 }));
  });

  it('anyone cannot queue a pickup_alert to the outbox', async () => {
    await assertFails(setDoc(doc(anon(), 'notifications_outbox/o1'), { kind: 'pickup_alert' }));
  });
});

// ── Profiles: private doc vs public mirror ──────────────────────────
describe('profiles: private doc for self + chapter staff, public mirror for everyone', () => {
  it('member can read their own private profile', async () => {
    await assertSucceeds(getDoc(doc(as('volA'), 'users/volA')));
  });

  it("president can read a member of their own chapter", async () => {
    await assertSucceeds(getDoc(doc(as('presA'), 'users/volA')));
  });

  it("president cannot read a member of another chapter", async () => {
    await assertFails(getDoc(doc(as('presA'), 'users/volB')));
  });

  it('president cannot list private profiles directly (custody picker goes through a callable)', async () => {
    await assertFails(getDocs(query(collection(as('presA'), 'users'), where('chapter_id', '==', CH_A))));
  });

  it('president cannot list the whole org', async () => {
    await assertFails(getDocs(collection(as('presA'), 'users')));
  });

  it('exec can list every member', async () => {
    await assertSucceeds(getDocs(collection(as('exec'), 'users')));
  });

  it('member can read the public profile mirror', async () => {
    await assertSucceeds(getDoc(doc(as('volA'), 'public_profiles/volB')));
  });

  it('member cannot write to the public profile mirror', async () => {
    await assertFails(setDoc(doc(as('volA'), 'public_profiles/volA'), { name: 'Top of the leaderboard', leaderboard_score: 1e9 }));
  });

  it('public profile mirror is readable by the website without signing in', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'public_profiles/volB')));
  });
});

// ── Positive controls for the tightened paths ───────────────────────
describe('tightened paths still allow the real app flows', () => {
  it('exec can correct the public counters', async () => {
    await assertSucceeds(updateDoc(doc(as('exec'), 'org_stats/global'), { meals: 120 }));
  });

  it('member can create the shadow org_unit for an existing chapter', async () => {
    await assertSucceeds(setDoc(doc(as('volB'), `org_units/${CH_B}`), { type: 'chapter', name: 'Chapter B' }));
  });

  it('member cannot create an org_unit for a chapter that does not exist', async () => {
    await assertFails(setDoc(doc(as('volA'), 'org_units/ch-fake'), { type: 'chapter', name: 'Fake' }));
  });

  it('restaurant can create the partner org_unit for its own restaurant', async () => {
    await assertSucceeds(setDoc(doc(as('rest'), 'org_units/r1'), { type: 'partner', name: 'R1' }));
  });

  it("restaurant cannot create the partner org_unit for someone else's restaurant", async () => {
    await assertFails(setDoc(doc(as('rest'), 'org_units/r2'), { type: 'partner', name: 'R2' }));
  });

  it('member can record their own member role_assignment', async () => {
    await assertSucceeds(setDoc(doc(as('volA'), 'role_assignments/volA_member_ch-a'), {
      user_id: 'volA', role_key: 'member', status: 'active',
    }));
  });

  it('member cannot queue outbox work for another member (queueBusinessNotification does)', async () => {
    await assertFails(setDoc(doc(as('volA'), 'notifications_outbox/o2'), {
      user_id: 'rest', kind: 'pickup', title: 't', body: 'b', status: 'queued',
    }));
  });

  it('member can queue outbox work addressed to themselves', async () => {
    await assertSucceeds(setDoc(doc(as('volA'), 'notifications_outbox/o5'), {
      user_id: 'volA', kind: 'pickup', title: 't', body: 'b', status: 'queued',
    }));
  });

  it('member cannot redirect a member notification to an arbitrary email', async () => {
    await assertFails(setDoc(doc(as('volA'), 'notifications_outbox/o3'), {
      user_id: 'rest', channel: 'email', email: 'attacker@example.org', kind: 'pickup', title: 't', body: 'b',
    }));
  });

  it('signed-out visitors cannot queue email to an arbitrary address', async () => {
    await assertFails(setDoc(doc(anon(), 'notifications_outbox/o4'), {
      to_email: 'applicant@example.org', subject: 's', body: 'b', kind: 'chapter_application_receipt',
    }));
  });
});

describe('dispatch state: coordinators see it, nobody else writes it', () => {
  it('chapter president can read dispatch status', async () => {
    await assertSucceeds(getDoc(doc(as('presA'), 'pickups/pAvail/dispatch/state')));
  });
  it('other chapter president and volunteers cannot', async () => {
    await assertFails(getDoc(doc(as('presB'), 'pickups/pAvail/dispatch/state')));
    await assertFails(getDoc(doc(as('volA'), 'pickups/pAvail/dispatch/state')));
  });
  it('nobody reads who was alerted or writes dispatch state from a client', async () => {
    await assertFails(getDoc(doc(as('presA'), 'pickups/pAvail/dispatch_alerts/g_volA')));
    await assertFails(setDoc(doc(as('exec'), 'pickups/pAvail/dispatch/state'), { status: 'closed' }));
  });
});

describe('vehicle details', () => {
  const vehicle = { type: 'suv', package_capacity: 12, weight_capacity_lbs: 300, equipment: ['cooler'] };
  it('a volunteer can save their own vehicle', async () => {
    await assertSucceeds(updateDoc(doc(as('volA'), 'users/volA'), { vehicle }));
  });
  it('nobody can write someone else\'s vehicle', async () => {
    await assertFails(updateDoc(doc(as('volA'), 'users/volA2'), { vehicle }));
  });
});
