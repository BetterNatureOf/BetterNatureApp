// A2 rules test harness. Covers the base access-model invariants
// AND regression cases for every finding raised in ChatGPT's two
// review passes.
//
// Prereqs (one-time):
//   npm i -D @firebase/rules-unit-testing@3.0.4
//   # Firebase CLI needs Java 17+.
//
// Run:
//   firebase emulators:exec --only firestore,storage --project demo-a2 \
//     'node scripts/test-a2-rules.cjs'
//
// NEVER point this at a real Firestore project.

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

// H1 — rules-unit-testing 3.0.4 wraps the firebase@10 compat SDK.
// The serverTimestamp sentinel lives on the compat Firestore
// namespace. Load it once so release/handoff positive fixtures can
// stamp request.time without hard-coding an ISO string (which the
// new G2 rule rejects).
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const SERVER_TS = firebase.firestore.FieldValue.serverTimestamp();

const projectId = 'demo-a2';
const firestoreRules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8');

const ALICE = 'alice-member';
const BOB   = 'bob-member';
const PRES  = 'pat-pres';
const EXEC  = 'eve-exec';
const OUT_PRES = 'oscar-pres';
const REST_OWNER = 'rose-rest';
const REST_ID = 'rose-restaurant';

// F10 — every withSecurityRulesDisabled callback MUST capture
// ctx.firestore() once and reuse that handle. rules-unit-testing
// 3.0.4 reapplies emulator settings on every ctx.firestore() call,
// which throws after the first operation. Helpers below enforce
// the pattern.
async function seedBlock(env, fn) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await fn(db);
  });
}

async function seed(env) {
  await seedBlock(env, async (db) => {
    await db.doc(`users/${ALICE}`).set({ id: ALICE, name: 'Alice', email: 'alice@x', role: 'member', member_status: 'approved', chapter_id: 'ch-memphis', lbs_rescued: 10 });
    await db.doc(`users/${BOB}`).set({ id: BOB, name: 'Bob', email: 'bob@x', role: 'member', member_status: 'approved', chapter_id: 'ch-nyc' });
    await db.doc(`users/${PRES}`).set({ id: PRES, name: 'Pat', email: 'pat@x', role: 'chapter_president', member_status: 'approved', chapter_id: 'ch-memphis' });
    await db.doc(`users/${OUT_PRES}`).set({ id: OUT_PRES, name: 'Oscar', email: 'oscar@x', role: 'chapter_president', member_status: 'approved', chapter_id: 'ch-nyc' });
    await db.doc(`users/${EXEC}`).set({ id: EXEC, name: 'Eve', email: 'eve@x', role: 'executive', member_status: 'approved' });
    await db.doc(`users/${REST_OWNER}`).set({ id: REST_OWNER, name: 'Rose', email: 'rose@x', role: 'restaurant', member_status: 'approved', restaurant_id: REST_ID, restaurant_status: 'approved', chapter_id: 'ch-memphis' });
    await db.doc(`restaurants/${REST_ID}`).set({ user_id: REST_OWNER, name: 'Rose Diner', status: 'approved' });
    await db.doc(`public_profiles/${ALICE}`).set({ uid: ALICE, display_name: 'Alice', chapter_id: 'ch-memphis', role_label: 'member', referral_code: 'BNALICE1' });
    await db.doc(`pickups/px1`).set({ restaurant_id: REST_ID, chapter_id: 'ch-memphis', status: 'available' });
  });
}

// Helper to build an authenticated context with a verified token.
function verified(env, uid, email) {
  return env.authenticatedContext(uid, { email, email_verified: true });
}
function unverified(env, uid, email) {
  return env.authenticatedContext(uid, { email, email_verified: false });
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
  const alice = verified(env, ALICE, 'alice@x');
  const bob   = verified(env, BOB,   'bob@x');
  const pres  = verified(env, PRES,  'pat@x');
  const outPres = verified(env, OUT_PRES, 'oscar@x');
  const exec  = verified(env, EXEC,  'eve@x');
  const restOwner = verified(env, REST_OWNER, 'rose@x');
  // B11 — rules-unit-testing 3.0.4 (the repository's declared
  // version) reapplies emulator settings on every ctx.firestore()
  // call, which fails after the first write. Cache the handle per
  // context so each assertion reuses the same Firestore/Storage
  // instance.
  const fsCache = new WeakMap();
  const stCache = new WeakMap();
  const fs_ = (ctx) => { if (!fsCache.has(ctx)) fsCache.set(ctx, ctx.firestore()); return fsCache.get(ctx); };
  const st_ = (ctx) => { if (!stCache.has(ctx)) stCache.set(ctx, ctx.storage());   return stCache.get(ctx); };

  // ── Base access model ──────────────────────────────────────────
  await assertFails   (fs_(anon).doc(`users/${ALICE}`).get());
  await assertSucceeds(fs_(alice).doc(`users/${ALICE}`).get());
  await assertFails   (fs_(alice).doc(`users/${BOB}`).get());
  await assertSucceeds(fs_(pres).doc(`users/${ALICE}`).get());  // same-chapter pres
  await assertFails   (fs_(outPres).doc(`users/${ALICE}`).get()); // other chapter
  await assertSucceeds(fs_(exec).doc(`users/${BOB}`).get());
  await assertFails   (fs_(anon).collection('users').get());
  await assertFails   (fs_(alice).collection('users').get());
  await assertSucceeds(fs_(exec).collection('users').get());

  // ── public_profiles ────────────────────────────────────────────
  await assertSucceeds(fs_(anon).doc(`public_profiles/${ALICE}`).get());
  await assertSucceeds(fs_(anon).collection('public_profiles').get());
  await assertFails   (fs_(alice).doc(`public_profiles/${ALICE}`).set({ display_name: 'A', lbs_rescued: 99999 }));
  await assertFails   (fs_(exec).doc(`public_profiles/${BOB}`).set({ display_name: 'injected', lbs_rescued: 1e9 }));

  // ── Role / scope self-escalation ───────────────────────────────
  await assertFails   (fs_(alice).doc(`users/${ALICE}`).update({ role: 'executive' }));
  await assertFails   (fs_(bob).doc(`users/${BOB}`).update({ verification_status: 'approved' }));
  await assertFails   (fs_(pres).doc(`users/${PRES}`).update({ chapter_id: 'ch-nyc' }));
  await assertSucceeds(fs_(alice).doc(`users/${ALICE}`).update({ city: 'Memphis' }));

  // ── R5 (verified-email requirement) ────────────────────────────
  // Unverified member whose email matches another member's cannot read.
  const bobUnverified = unverified(env, BOB, 'alice@x'); // claiming alice's email, unverified
  await assertFails(fs_(bobUnverified).doc(`users/${ALICE}`).get());
  // Unverified founder-email cannot self-elevate.
  const founderUnv = unverified(env, 'mallory', 'satvik.koya@betternatureofficial.org');
  await seedBlock(env, async (db) => {
    await db.doc('users/mallory').set({ id: 'mallory', name: 'M', role: 'member', member_status: 'pending' });
  });
  await assertFails(fs_(founderUnv).doc('users/mallory').update({ role: 'super_admin' }));
  // Verified founder-email still works.
  const founderV = verified(env, 'mallory', 'satvik.koya@betternatureofficial.org');
  await assertSucceeds(fs_(founderV).doc('users/mallory').update({ role: 'super_admin' }));

  // ── Create-time field discipline (R-followup) ──────────────────
  // Attempt to self-create a profile with role:executive → DENIED
  const attacker = verified(env, 'eve2', 'eve2@x');
  await assertFails(fs_(attacker).doc('users/eve2').set({ id: 'eve2', name: 'E', email: 'eve2@x', role: 'executive' }));
  // Attempt to self-create with foreign restaurant_id → DENIED
  const attacker2 = verified(env, 'eve3', 'eve3@x');
  await assertFails(fs_(attacker2).doc('users/eve3').set({ id: 'eve3', name: 'E', email: 'eve3@x', role: 'member', member_status: 'pending', restaurant_id: REST_ID }));
  // Clean self-create → OK
  await assertSucceeds(fs_(attacker2).doc('users/eve3').set({ id: 'eve3', name: 'E', email: 'eve3@x', role: 'member', member_status: 'pending' }));

  // ── Update-path foreign restaurant linkage ─────────────────────
  // Can't link to a restaurant not owned by caller.
  await assertFails(fs_(alice).doc(`users/${ALICE}`).update({ restaurant_id: REST_ID }));

  // ── Nested driver.license_* self-write ─────────────────────────
  await assertFails(fs_(alice).doc(`users/${ALICE}`).update({ driver: { license_url: 'https://example.com/leak.jpg' } }));
  await assertFails(fs_(alice).doc(`users/${ALICE}`).update({ 'driver.license_front_url': 'https://example.com/leak.jpg' }));

  // ── Email self-redirect ────────────────────────────────────────
  await assertFails(fs_(alice).doc(`users/${ALICE}`).update({ email: 'phish@example.com' }));

  // ── Linked-account query (own token email only, verified) ─────
  await assertSucceeds(fs_(alice).collection('users').where('email', '==', 'alice@x').get());
  await assertFails   (fs_(alice).collection('users').where('email', '==', 'bob@x').get());
  await assertFails   (fs_(bobUnverified).collection('users').where('email', '==', 'alice@x').get());

  // ── id_reviews (R8 + R4 path shape) ────────────────────────────
  // F11 — hyphenated UIDs must still match the path pattern.
  // ALICE constant is 'alice-member'; both halves are regex-safe.
  await assertSucceeds(fs_(alice).doc(`id_reviews/${ALICE}`).set({
    id_front_present: true,
    id_front_path: `id-docs/personal/${ALICE}-front-1700000000000.jpg`,
    id_back_present: true,
    id_back_path: `id-docs/personal/${ALICE}-back-1700000000001.jpg`,
    status: 'pending',
  }));
  // Alice CANNOT write a foreign path (R-followup #1).
  await assertFails(fs_(alice).doc(`id_reviews/${ALICE}`).set({
    id_front_present: true,
    id_front_path: `id-docs/personal/${BOB}-front-1700000000002.jpg`, // Bob's uid in path
    status: 'pending',
  }));
  // Alice CANNOT self-approve.
  await assertFails(fs_(alice).doc(`id_reviews/${ALICE}`).set({
    id_front_present: true,
    id_front_path: `id-docs/personal/${ALICE}-front-1700000000000.jpg`,
    status: 'approved',
  }));
  // Bob cannot read Alice's review.
  await assertFails(fs_(bob).doc(`id_reviews/${ALICE}`).get());
  // Pres cannot read Alice's review (R8 — pres MUST NOT have ID access).
  await assertFails(fs_(pres).doc(`id_reviews/${ALICE}`).get());
  // Exec can read.
  await assertSucceeds(fs_(exec).doc(`id_reviews/${ALICE}`).get());

  // ── F6 — resubmission after migration ──────────────────────────
  // Seed a migrated review for Bob: has id_tokens_migrated_at + a
  // reviewer decision (rejected). Bob must be able to resubmit by
  // writing new paths + status:pending without touching migration
  // metadata.
  await seedBlock(env, async (db) => {
    await db.doc(`id_reviews/${BOB}`).set({
      id_front_present: true,
      id_front_path: `id-docs/personal/${BOB}-front-1690000000000.jpg`,
      status: 'rejected',
      reviewed_at: new Date(),
      reviewed_by: EXEC,
      id_tokens_migrated_at: new Date(),
    });
  });
  // Resubmit — change evidence + flip status back to pending.
  await assertSucceeds(fs_(bob).doc(`id_reviews/${BOB}`).update({
    id_front_present: true,
    id_front_path: `id-docs/personal/${BOB}-front-1710000000000.jpg`,
    id_back_present: true,
    id_back_path: `id-docs/personal/${BOB}-back-1710000000001.jpg`,
    status: 'pending',
    uploaded_at: new Date(),
  }));
  // Bob still cannot self-approve a resubmitted row.
  await assertFails(fs_(bob).doc(`id_reviews/${BOB}`).update({ status: 'approved' }));

  // ── Outbox lockdown ────────────────────────────────────────────
  // Self-recipient OK, no channel/email/player_id stuffing.
  await assertSucceeds(fs_(alice).collection('notifications_outbox').add({
    user_id: ALICE, kind: 'general', title: 'ok', body: 'ok',
  }));
  // Legacy format (channel + email) denied.
  await assertFails(fs_(alice).collection('notifications_outbox').add({
    user_id: ALICE, channel: 'email', email: 'phish@x', title: 't', body: 'b',
  }));
  // Cross-user client write denied for non-exec.
  await assertFails(fs_(alice).collection('notifications_outbox').add({
    user_id: BOB, kind: 'general', title: 't', body: 'b',
  }));
  // Pres cross-chapter outbox denied (R-followup #3).
  await assertFails(fs_(pres).collection('notifications_outbox').add({
    user_id: BOB, kind: 'general', title: 't', body: 'b',
  }));
  // Exec cross-user OK.
  await assertSucceeds(fs_(exec).collection('notifications_outbox').add({
    user_id: BOB, kind: 'general', title: 't', body: 'b',
  }));

  // ── tax_receipts list vs get ──────────────────────────────────
  await seedBlock(env, async (db) => {
    await db.doc('tax_receipts/r1').set({ pickup_id: 'p1', donor: 'alice@x' });
  });
  await assertSucceeds(fs_(anon).doc('tax_receipts/r1').get());
  await assertFails   (fs_(anon).collection('tax_receipts').get());

  // ── B1 — signup finalization allowlist ─────────────────────────
  await seedBlock(env, async (db) => {
    await db.doc(`restaurants/mine`).set({ user_id: 'carl', status: 'pending' });
    await db.doc(`users/carl`).set({ id: 'carl', name: 'Carl', email: 'carl@x', role: 'member', member_status: 'pending' });
  });
  const carl = verified(env, 'carl', 'carl@x');
  await assertSucceeds(fs_(carl).doc(`users/carl`).update({
    restaurant_id: 'mine', restaurant_status: 'pending', chapter_id: 'ch-memphis',
    chapter_name: 'Memphis', partner_type: 'restaurant', role: 'restaurant',
  }));
  await seedBlock(env, async (db) => {
    await db.doc(`restaurants/mine2`).set({ user_id: 'dana', status: 'pending' });
    await db.doc(`users/dana`).set({ id: 'dana', name: 'Dana', email: 'dana@x', role: 'member', member_status: 'approved' });
  });
  const dana = verified(env, 'dana', 'dana@x');
  await assertFails(fs_(dana).doc(`users/dana`).update({
    restaurant_id: 'mine2', restaurant_status: 'pending', email: 'phish@example.invalid',
  }));
  // Attack — signup finalization + legacy ID field in one update → DENIED.
  await assertFails(fs_(dana).doc(`users/dana`).update({
    restaurant_id: 'mine2', restaurant_status: 'pending',
    id_document_front_url: 'https://example.invalid/leak',
  }));

  // ── B2 — create-time email must match the auth token ──────────
  const ed = verified(env, 'ed', 'ed@x');
  await assertFails(fs_(ed).doc('users/ed').set({ id: 'ed', name: 'E', email: 'phish@x', role: 'member', member_status: 'pending' }));
  await assertSucceeds(fs_(ed).doc('users/ed').set({ id: 'ed', name: 'E', email: 'ed@x', role: 'member', member_status: 'pending' }));

  // ── B4 — isSelfReleaseClaim requires released_by == auth.uid ──
  await seedBlock(env, async (db) => {
    await db.doc(`pickups/rp1`).set({
      restaurant_id: REST_ID, chapter_id: 'ch-memphis',
      status: 'claimed', claimed_by: ALICE,
    });
  });
  // H1 — released_at MUST equal request.time; use the compat
  // serverTimestamp sentinel. An ISO string was accepted by the
  // old rule but is denied by G2.
  await assertSucceeds(fs_(alice).doc(`pickups/rp1`).update({
    status: 'available', claimed_by: null, claimed_at: null,
    released_by: ALICE, released_at: SERVER_TS,
    cancel_reason: 'change_of_plans', cancelled_at: new Date().toISOString(),
  }));
  await seedBlock(env, async (db) => {
    await db.doc(`pickups/rp2`).set({
      restaurant_id: REST_ID, chapter_id: 'ch-memphis',
      status: 'claimed', claimed_by: ALICE,
    });
  });
  await assertFails(fs_(bob).doc(`pickups/rp2`).update({
    status: 'available', claimed_by: null, released_by: BOB,
  }));

  // ── G2 — released_at MUST equal request.time ───────────────────
  // A client-supplied future released_at is rejected. Positive
  // case (serverTimestamp sentinel == request.time) is exercised by
  // the production `cancelClaim` → integration flow we tested
  // under B4 above.
  await seedBlock(env, async (db) => {
    await db.doc(`pickups/rp3`).set({
      restaurant_id: REST_ID, chapter_id: 'ch-memphis',
      status: 'claimed', claimed_by: ALICE,
    });
  });
  await assertFails(fs_(alice).doc(`pickups/rp3`).update({
    status: 'available', claimed_by: null, claimed_at: null,
    released_by: ALICE,
    released_at: '2099-01-01T00:00:00Z',
  }));
  // A missing released_at is also denied.
  await assertFails(fs_(alice).doc(`pickups/rp3`).update({
    status: 'available', claimed_by: null, released_by: ALICE,
    // released_at omitted
  }));

  // ── G1 — Verification badge requires explicit 'approved' ───────
  // Covered by scripts/test-idgate.cjs (plain Node). The 8 cases
  // there assert that null/pending/rejected/presence-only all fail
  // the gate; only 'approved' passes.

  // ── Storage ID files ───────────────────────────────────────────
  await assertSucceeds(st_(alice).ref(`id-docs/personal/${ALICE}-front-123.jpg`).put(new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' }));
  await assertSucceeds(st_(alice).ref(`id-docs/personal/${ALICE}-front-123.jpg`).getDownloadURL());
  await assertFails   (st_(bob).ref(`id-docs/personal/${ALICE}-front-123.jpg`).getDownloadURL());
  await assertFails   (st_(anon).ref(`id-docs/personal/${ALICE}-front-123.jpg`).getDownloadURL());
  await assertSucceeds(st_(exec).ref(`id-docs/personal/${ALICE}-front-123.jpg`).getDownloadURL());

  console.log('[A2 rules] all assertions passed ✓');
  await env.cleanup();
}

main().catch((e) => { console.error('[A2 rules] FAILED', e); process.exit(1); });
