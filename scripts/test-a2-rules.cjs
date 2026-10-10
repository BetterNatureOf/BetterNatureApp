// A2 rules test harness. Proves the access-model invariants the
// audit called for, using the actual firestore.rules + storage.rules
// files via the Firebase emulators (never a real project).
//
// Prereqs (one-time):
//   npm i -D @firebase/rules-unit-testing firebase-tools
//   # Firebase CLI needs Java 17+. firebase-tools 14.27.0 is the
//   # last line that works on Java 17 if your JDK is older.
//
// Run:
//   firebase emulators:exec --only firestore,storage --project demo-a2 \
//     'node scripts/test-a2-rules.cjs'
//
// NEVER point this at a real Firestore project. It mutates docs
// and intentionally creates "attacker" accounts.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const projectId = 'demo-a2';
const firestoreRules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8');

const ALICE = 'alice-member';
const BOB   = 'bob-member';
const PRES  = 'pat-pres';     // chapter_president of 'ch-memphis'
const EXEC  = 'eve-exec';
const OUT_PRES = 'oscar-pres'; // president of 'ch-nyc'
const ANON  = null;

async function seed(env) {
  const admin = env.unauthenticatedContext().firestore; // need rules bypass → use authenticated(admin-ish) via rules suppression
  // We seed through withSecurityRulesDisabled so the setup isn't
  // itself a rules test.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${ALICE}`).set({
      id: ALICE, name: 'Alice', email: 'alice@x', role: 'member',
      member_status: 'approved', chapter_id: 'ch-memphis',
      phone: '555', lbs_rescued: 10, hours_logged: 2, events_attended: 1,
      referral_code: 'BNALICE1',
    });
    await db.doc(`users/${BOB}`).set({
      id: BOB, name: 'Bob', email: 'bob@x', role: 'member',
      member_status: 'approved', chapter_id: 'ch-nyc',
      phone: '666', lbs_rescued: 7, hours_logged: 1, events_attended: 0,
    });
    await db.doc(`users/${PRES}`).set({
      id: PRES, name: 'Pat', email: 'pat@x', role: 'chapter_president',
      member_status: 'approved', chapter_id: 'ch-memphis',
    });
    await db.doc(`users/${OUT_PRES}`).set({
      id: OUT_PRES, name: 'Oscar', email: 'oscar@x', role: 'chapter_president',
      member_status: 'approved', chapter_id: 'ch-nyc',
    });
    await db.doc(`users/${EXEC}`).set({
      id: EXEC, name: 'Eve', email: 'eve@x', role: 'executive',
      member_status: 'approved',
    });
    await db.doc('public_profiles/' + ALICE).set({
      uid: ALICE, display_name: 'Alice', chapter_id: 'ch-memphis',
      role_label: 'member', lbs_rescued: 10, hours_logged: 2,
      events_attended: 1, points: 0, meals_rescued: 12, referral_code: 'BNALICE1',
    });
  });
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage:   { rules: storageRules },
  });
  await env.clearFirestore();
  await seed(env);

  const anon = env.unauthenticatedContext();
  const alice = env.authenticatedContext(ALICE, { email: 'alice@x' });
  const bob   = env.authenticatedContext(BOB,   { email: 'bob@x' });
  const pres  = env.authenticatedContext(PRES,  { email: 'pat@x' });
  const outPres = env.authenticatedContext(OUT_PRES, { email: 'oscar@x' });
  const exec  = env.authenticatedContext(EXEC,  { email: 'eve@x' });

  const fs_ = (ctx) => ctx.firestore();
  const st_ = (ctx) => ctx.storage();

  // ── Private profile reads ───────────────────────────────────────
  // Anonymous: cannot read anyone's /users doc
  await assertFails(fs_(anon).doc(`users/${ALICE}`).get());
  // Member reads self: OK
  await assertSucceeds(fs_(alice).doc(`users/${ALICE}`).get());
  // Member reads another member: DENIED
  await assertFails(fs_(alice).doc(`users/${BOB}`).get());
  // Same-chapter president reads chapter member: OK
  await assertSucceeds(fs_(pres).doc(`users/${ALICE}`).get());
  // President of another chapter reads out-of-scope member: DENIED
  await assertFails(fs_(outPres).doc(`users/${ALICE}`).get());
  // Exec reads anyone: OK
  await assertSucceeds(fs_(exec).doc(`users/${BOB}`).get());
  // Anonymous list: DENIED
  await assertFails(fs_(anon).collection('users').get());
  // Member list: DENIED
  await assertFails(fs_(alice).collection('users').get());
  // Exec list: OK
  await assertSucceeds(fs_(exec).collection('users').get());

  // ── Public profile reads ────────────────────────────────────────
  // Anonymous read of public_profiles: OK
  await assertSucceeds(fs_(anon).doc(`public_profiles/${ALICE}`).get());
  // Anonymous list of public_profiles: OK (open collection)
  await assertSucceeds(fs_(anon).collection('public_profiles').get());

  // ── Public profile writes (denied — mirror only) ────────────────
  // Member cannot write their own public_profile (rules deny all clients)
  await assertFails(fs_(alice).doc(`public_profiles/${ALICE}`).set({
    display_name: 'A', lbs_rescued: 99999,
  }));
  // Exec also cannot write — only the Cloud Function admin SDK path
  await assertFails(fs_(exec).doc(`public_profiles/${BOB}`).set({
    display_name: 'injected', lbs_rescued: 1e9,
  }));

  // ── Role / scope self-escalation ────────────────────────────────
  // Member cannot elevate role via update
  await assertFails(fs_(alice).doc(`users/${ALICE}`).update({ role: 'executive' }));
  // Member cannot flip member_status to approved (if it weren't already)
  await assertFails(fs_(bob).doc(`users/${BOB}`).update({ verification_status: 'approved' }));
  // Pres cannot change their own chapter_id (A4)
  await assertFails(fs_(pres).doc(`users/${PRES}`).update({ chapter_id: 'ch-nyc' }));
  // Member can edit non-privileged fields on their own doc
  await assertSucceeds(fs_(alice).doc(`users/${ALICE}`).update({ city: 'Memphis' }));

  // ── Self-create with privileged seeds (A1) ──────────────────────
  // Attempt to self-create a profile with role:executive → DENIED
  const attacker = env.authenticatedContext('mallory', { email: 'm@x' });
  await assertFails(fs_(attacker).doc('users/mallory').set({
    id: 'mallory', name: 'M', email: 'm@x', role: 'executive',
  }));
  // Clean self-create (role:member, member_status:pending) → OK
  await assertSucceeds(fs_(attacker).doc('users/mallory').set({
    id: 'mallory', name: 'M', email: 'm@x', role: 'member', member_status: 'pending',
  }));

  // ── Linked-account query carve-out ──────────────────────────────
  // Alice can query /users where email == her own token email
  await assertSucceeds(fs_(alice).collection('users').where('email', '==', 'alice@x').get());
  // Alice CANNOT query /users where email == Bob's address
  await assertFails(fs_(alice).collection('users').where('email', '==', 'bob@x').get());

  // ── Storage: ID documents ───────────────────────────────────────
  // Alice uploads her own id file: OK
  await assertSucceeds(
    st_(alice).ref(`id-docs/front/${ALICE}-front-123.jpg`).put(new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' })
  );
  // Alice reads her own id: OK
  await assertSucceeds(st_(alice).ref(`id-docs/front/${ALICE}-front-123.jpg`).getDownloadURL());
  // Bob tries to read Alice's id: DENIED
  await assertFails(st_(bob).ref(`id-docs/front/${ALICE}-front-123.jpg`).getDownloadURL());
  // Anonymous read: DENIED
  await assertFails(st_(anon).ref(`id-docs/front/${ALICE}-front-123.jpg`).getDownloadURL());
  // Exec read: OK
  await assertSucceeds(st_(exec).ref(`id-docs/front/${ALICE}-front-123.jpg`).getDownloadURL());

  // ── tax_receipts list vs get (regression from Phase 1a) ─────────
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('tax_receipts/r1').set({ pickup_id: 'p1', donor: 'alice@x' });
  });
  // Anonymous get: OK (capability-token model)
  await assertSucceeds(fs_(anon).doc('tax_receipts/r1').get());
  // Anonymous list: DENIED
  await assertFails(fs_(anon).collection('tax_receipts').get());

  console.log('[A2 rules] all assertions passed ✓');
  await env.cleanup();
}

main().catch((e) => { console.error('[A2 rules] FAILED', e); process.exit(1); });
