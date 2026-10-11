#!/usr/bin/env node
// C1 — idempotency + authorization + consistency tests for
// completePickupOperation. The mock here is MVCC-faithful enough
// to model the properties the callable depends on:
//   - transaction reads see a consistent snapshot
//   - writes stage inside the tx and only commit at the end
//   - an exception rolls back all staged writes
//   - two concurrent transactions on overlapping docs retry on
//     conflict (one wins atomically)
//
// It does NOT exercise live Firestore. The full Functions emulator
// + staging run remain the authoritative pre-deploy gate. These
// unit tests catch logic / schema / authorization regressions
// before they get there.
//
// Run:
//   node scripts/test-c1-complete.cjs

const assert = require('assert');
const Module = require('module');

// ── MVCC-faithful in-process store ───────────────────────────────
class Store {
  constructor() {
    this.docs = new Map();  // path → { version, data }
    this.writes = [];       // audit of committed ops only
  }
  getRaw(path) { return this.docs.get(path) || null; }
  getData(path) { return this.docs.get(path)?.data || null; }
}

function cloneForRead(entry) {
  if (!entry) return { exists: false, version: 0, data: null };
  return { exists: true, version: entry.version, data: JSON.parse(JSON.stringify(entry.data)) };
}

function sentinelsResolve(data, prevData) {
  const out = { ...(prevData || {}) };
  for (const [k, v] of Object.entries(data || {})) {
    if (v && v.__fieldvalue === 'serverTimestamp') out[k] = new Date();
    else if (v && v.__fieldvalue === 'increment') out[k] = (prevData?.[k] || 0) + v.amount;
    else out[k] = v;
  }
  return out;
}
function sentinelsResolveReplace(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v && v.__fieldvalue === 'serverTimestamp') out[k] = new Date();
    else if (v && v.__fieldvalue === 'increment') out[k] = v.amount;
    else out[k] = v;
  }
  return out;
}

function buildAdminStub(store) {
  const FieldValue = {
    serverTimestamp: () => ({ __fieldvalue: 'serverTimestamp' }),
    increment: (amount) => ({ __fieldvalue: 'increment', amount }),
  };

  function docRef(path) {
    return {
      path,
      id: path.split('/').pop(),
      get: async () => cloneForRead(store.getRaw(path)).exists
        ? { exists: true, ref: docRef(path), data: () => cloneForRead(store.getRaw(path)).data }
        : { exists: false, ref: docRef(path), data: () => null },
      set: async (data, opts) => {
        const prev = store.getRaw(path);
        const next = (opts && opts.merge)
          ? sentinelsResolve(data, prev?.data)
          : sentinelsResolveReplace(data);
        store.docs.set(path, { version: (prev?.version || 0) + 1, data: next });
        store.writes.push({ op: 'set', path, merge: !!opts?.merge });
      },
      update: async (data) => {
        const prev = store.getRaw(path);
        store.docs.set(path, {
          version: (prev?.version || 0) + 1,
          data: sentinelsResolve(data, prev?.data || {}),
        });
        store.writes.push({ op: 'update', path });
      },
      create: async (data) => {
        if (store.getRaw(path)) {
          const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e;
        }
        store.docs.set(path, { version: 1, data: sentinelsResolveReplace(data) });
        store.writes.push({ op: 'create', path });
      },
      delete: async () => {
        if (store.getRaw(path)) store.docs.delete(path);
        store.writes.push({ op: 'delete', path });
      },
    };
  }
  function collectionRef(path) {
    return {
      doc: (id) => docRef(`${path}/${id}`),
      add: async (data) => {
        const id = `auto_${Math.random().toString(36).slice(2, 10)}`;
        const r = docRef(`${path}/${id}`);
        await r.create(data);
        return r;
      },
    };
  }

  function firestore() {
    return {
      doc: (p) => docRef(p),
      collection: (p) => collectionRef(p),
      async runTransaction(fn) {
        // Simulate OCC — the tx stages all writes and tracks read
        // versions. If any read-version changed between the read
        // and commit, we retry (up to 5 times).
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const stagedWrites = [];       // {op, path, data, opts?}
          const stagedDeletes = new Set();
          const stagedCreates = new Map();  // path → data (synthetic doc)
          const readVersions = new Map();   // path → version at read time
          const stagedMap = new Map();      // path → latest staged value (for in-tx reads)

          const stagedGet = (path) => {
            if (stagedMap.has(path)) {
              return { exists: true, version: 0, data: stagedMap.get(path) };
            }
            if (stagedDeletes.has(path)) {
              return { exists: false, version: 0, data: null };
            }
            const live = cloneForRead(store.getRaw(path));
            if (!readVersions.has(path)) readVersions.set(path, live.version);
            return live;
          };

          const tx = {
            get: async (ref) => {
              const r = stagedGet(ref.path);
              return {
                exists: r.exists,
                ref: ref,
                data: () => r.data,
              };
            },
            set: (ref, data, opts) => {
              const prev = stagedMap.has(ref.path)
                ? stagedMap.get(ref.path)
                : store.getData(ref.path);
              const next = (opts && opts.merge)
                ? sentinelsResolve(data, prev || {})
                : sentinelsResolveReplace(data);
              stagedMap.set(ref.path, next);
              stagedDeletes.delete(ref.path);
              stagedWrites.push({ op: 'set', path: ref.path, data: next });
            },
            update: (ref, data) => {
              const prev = stagedMap.has(ref.path)
                ? stagedMap.get(ref.path)
                : store.getData(ref.path);
              if (!prev && !stagedCreates.has(ref.path)) {
                const e = new Error('NOT_FOUND');
                throw e;
              }
              const next = sentinelsResolve(data, prev || {});
              stagedMap.set(ref.path, next);
              stagedWrites.push({ op: 'update', path: ref.path, data: next });
            },
            create: (ref, data) => {
              if ((stagedMap.has(ref.path) && !stagedDeletes.has(ref.path))
                  || store.getRaw(ref.path)) {
                const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e;
              }
              const next = sentinelsResolveReplace(data);
              stagedMap.set(ref.path, next);
              stagedCreates.set(ref.path, next);
              stagedDeletes.delete(ref.path);
              stagedWrites.push({ op: 'create', path: ref.path, data: next });
            },
            delete: (ref) => {
              stagedMap.delete(ref.path);
              stagedCreates.delete(ref.path);
              stagedDeletes.add(ref.path);
              stagedWrites.push({ op: 'delete', path: ref.path });
            },
          };

          let fnResult;
          try {
            fnResult = await fn(tx);
          } catch (e) {
            // On any error inside the tx body, roll back all staged
            // writes by simply dropping them.
            throw e;
          }

          // Check read versions still match live state. If not,
          // retry (OCC-style).
          let conflict = false;
          for (const [path, version] of readVersions) {
            const live = store.getRaw(path);
            const liveVersion = live?.version || 0;
            if (liveVersion !== version) { conflict = true; break; }
          }
          if (conflict) continue;

          // Commit staged writes atomically.
          for (const w of stagedWrites) {
            if (w.op === 'delete') {
              store.docs.delete(w.path);
              store.writes.push({ op: 'delete', path: w.path });
              continue;
            }
            const prev = store.getRaw(w.path);
            store.docs.set(w.path, { version: (prev?.version || 0) + 1, data: w.data });
            store.writes.push({ op: w.op, path: w.path });
          }
          return fnResult;
        }
        throw new Error('too many transaction retries');
      },
    };
  }
  firestore.FieldValue = FieldValue;
  firestore.Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms }) };

  return {
    firestore,
    initializeApp: () => {},
    apps: [{}],
    storage: () => ({ bucket: () => ({ file: () => ({ exists: async () => [false] }) }) }),
    auth: () => ({ getUser: async () => ({ emailVerified: true, email: 'x@y' }) }),
  };
}

function stubRequire(store) {
  const originalLoad = Module._load;
  const admin = buildAdminStub(store);
  let handler = null;
  const functionsMock = {
    https: {
      onCall: (fn) => { handler = fn; return fn; },
      HttpsError: class HttpsError extends Error {
        constructor(code, msg) { super(msg); this.code = code; this.name = 'HttpsError'; }
      },
    },
    runWith: () => functionsMock,
    firestore: { document: () => ({ onWrite: () => () => null }) },
    pubsub: { schedule: () => ({ onRun: () => () => null }) },
  };
  Module._load = function (req, parent, ...rest) {
    if (req === 'firebase-admin') return admin;
    if (req === 'firebase-functions') return functionsMock;
    return originalLoad.call(this, req, parent, ...rest);
  };
  delete require.cache[require.resolve('../functions/completePickup.js')];
  require('../functions/completePickup.js');
  Module._load = originalLoad;
  return { admin, getHandler: () => handler };
}

// ── Fixture helpers ──────────────────────────────────────────────
function seedPickup(store, pickupId, overrides = {}) {
  store.docs.set(`pickups/${pickupId}`, { version: 1, data: {
    status: 'enroute',
    claimed_by: 'alice',
    claimed_at: new Date().toISOString(),
    enroute_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    verified_by_restaurant_at: new Date().toISOString(),
    restaurant_id: 'rose-restaurant',
    restaurant_name: 'Rose Diner',
    chapter_id: 'ch-memphis',
    chapter_name: 'Memphis',
    estimated_weight_lbs: 10,
    ...overrides,
  }});
}
function seedUser(store, uid, overrides = {}) {
  store.docs.set(`users/${uid}`, { version: 1, data: {
    role: 'member', member_status: 'approved', disabled: false,
    name: 'Alice', ...overrides,
  }});
}
function seedRestaurant(store, rid, overrides = {}) {
  store.docs.set(`restaurants/${rid}`, { version: 1, data: {
    user_id: 'rose-owner', name: 'Rose Diner', ...overrides,
  }});
}

async function run(ctx, data, callerUid) {
  return ctx.getHandler()(data, { auth: { uid: callerUid } });
}

// ── Tests ────────────────────────────────────────────────────────
async function test_happy() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  seedRestaurant(store, 'rose-restaurant');
  const res = await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.cached, false);
  assert.strictEqual(res.outcome, 'delivered');
  assert.ok(res.receipt_id);
  assert.strictEqual(store.getData('pickups/px1').status, 'completed');
  assert.strictEqual(store.getData('pickups/px1').tax_receipt_id, 'rcpt_px1');
  assert.ok(store.getData('pickup_completions/px1'), 'completion sentinel exists');
  assert.ok(store.getData('member_activity/pickup_px1'));
  assert.ok(store.getData('tax_receipts/rcpt_px1'));
  const rec = store.getData('tax_receipts/rcpt_px1');
  assert.strictEqual(rec.receipt_no, '0001');
  assert.ok(rec.org && rec.org.ein, 'receipt carries org identity');
  // Totals.
  const u = store.getData('users/alice');
  assert.strictEqual(u.events_attended, 1);
  assert.strictEqual(u.pickups_completed, 1);
  assert.ok(u.leaderboard_score > 0);
  // org_stats bumped in-tx (meals/co2/water/lbs/hours/events).
  const org = store.getData('org_stats/global');
  assert.ok(org.meals > 0);
  assert.ok(org.co2 > 0);
  assert.ok(org.water > 0);
  // Notification work persisted inside the tx.
  const workKey = 'pickup:to_partner:complete:px1';
  const safeKey = workKey.replace(/[\/\s]/g, '_').slice(0, 400);
  assert.ok(store.getData(`notification_work/${safeKey}`), 'notification work queued');
  assert.ok(store.getData(`notification_dedup/${safeKey}`));
}

async function test_idempotent_replay() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  const u1 = store.getData('users/alice');
  const totalsBefore = { lbs: u1.lbs_rescued, events: u1.events_attended };
  const res2 = await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 999 }, 'alice');
  assert.strictEqual(res2.cached, true);
  const u2 = store.getData('users/alice');
  assert.strictEqual(u2.lbs_rescued, totalsBefore.lbs, 'lbs not double-bumped');
  assert.strictEqual(u2.events_attended, totalsBefore.events);
}

async function test_r1_override_not_exec() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1', { status: 'claimed', verified_by_restaurant_at: null });
  seedUser(store, 'alice', { disabled: true });
  seedRestaurant(store, 'rose-restaurant');
  let threw = null;
  try {
    await run(ctx, {
      pickup_id: 'px1', override: true, override_reason: 'nope',
      actual_weight_lbs: 0,
    }, 'alice');
  } catch (e) { threw = e; }
  assert.ok(threw, 'ordinary claimant override must be denied');
  assert.strictEqual(threw.code, 'permission-denied');
}

async function test_r1_override_requires_reason() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'eve', { role: 'executive' });
  seedRestaurant(store, 'rose-restaurant');
  let threw = null;
  try {
    await run(ctx, { pickup_id: 'px1', override: true, actual_weight_lbs: 10 }, 'eve');
  } catch (e) { threw = e; }
  assert.ok(threw);
  assert.strictEqual(threw.code, 'invalid-argument');
}

async function test_r2_cached_unrelated_user_denied() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  seedUser(store, 'bob');
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  let threw = null;
  try { await run(ctx, { pickup_id: 'px1' }, 'bob'); } catch (e) { threw = e; }
  assert.ok(threw, 'unrelated signed-in user cannot read cached completion');
  assert.strictEqual(threw.code, 'permission-denied');
}

async function test_r3_spoiled_replay_cached() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, { pickup_id: 'px1', spoiled: true, spoiled_kind: 'food_spoiled' }, 'alice');
  // Replay a spoiled completion → cached (not failed-precondition).
  const res2 = await run(ctx, { pickup_id: 'px1', spoiled: true }, 'alice');
  assert.strictEqual(res2.cached, true);
  assert.strictEqual(res2.outcome, 'spoiled');
  // Spoiled still mints the completion sentinel.
  assert.ok(store.getData('pickup_completions/px1'));
  // No receipt doc.
  assert.ok(!store.getData('tax_receipts/rcpt_px1'));
  // Totals NOT bumped on spoiled.
  const u = store.getData('users/alice');
  assert.ok(!u.lbs_rescued, 'spoiled bumps nothing');
}

async function test_r3_unclaimed_override_replay_cached() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1', { claimed_by: null, status: 'available' });
  seedUser(store, 'eve', { role: 'executive' });
  seedRestaurant(store, 'rose-restaurant');
  const res = await run(ctx, {
    pickup_id: 'px1', override: true, override_reason: 'cleanup',
    actual_weight_lbs: 15,
  }, 'eve');
  assert.strictEqual(res.outcome, 'exec_override');
  // No activity row (no claimant). But sentinel exists.
  assert.ok(store.getData('pickup_completions/px1'));
  // Replay returns cached, no re-bumping org_stats.
  const orgBefore = store.getData('org_stats/global');
  const res2 = await run(ctx, {
    pickup_id: 'px1', override: true, override_reason: 'cleanup',
    actual_weight_lbs: 15,
  }, 'eve');
  assert.strictEqual(res2.cached, true);
  const orgAfter = store.getData('org_stats/global');
  assert.strictEqual(orgBefore.lbs, orgAfter.lbs, 'org lbs not re-bumped on replay');
}

async function test_r5_org_in_transaction() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  const org = store.getData('org_stats/global');
  // Must have ALL the derived fields the dashboard reads.
  assert.ok(Number.isFinite(org.lbs), 'org.lbs');
  assert.ok(Number.isFinite(org.meals), 'org.meals');
  assert.ok(Number.isFinite(org.co2), 'org.co2');
  assert.ok(Number.isFinite(org.water), 'org.water');
  assert.ok(Number.isFinite(org.hours), 'org.hours');
  assert.ok(Number.isFinite(org.events), 'org.events');
}

async function test_r6_receipt_fields() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice', { name: 'Alice Volunteer' });
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  const r = store.getData('tax_receipts/rcpt_px1');
  assert.strictEqual(r.receipt_no, '0001');
  assert.strictEqual(r.volunteer_name, 'Alice Volunteer');
  assert.strictEqual(r.restaurant_id, 'rose-restaurant');
  assert.strictEqual(r.pickup_id, 'px1');
  assert.ok(r.org.ein);
  // Pickup stamp.
  const pk = store.getData('pickups/px1');
  assert.strictEqual(pk.tax_receipt_id, 'rcpt_px1');
  assert.ok(pk.tax_receipt_url.includes('rcpt_px1'));
}

async function test_r6_receipt_counter_distinct() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedPickup(store, 'px2');
  seedUser(store, 'alice');
  seedUser(store, 'bob');
  seedPickup(store, 'px2', { claimed_by: 'bob' });
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  await run(ctx, { pickup_id: 'px2', actual_weight_lbs: 30 }, 'bob');
  const r1 = store.getData('tax_receipts/rcpt_px1');
  const r2 = store.getData('tax_receipts/rcpt_px2');
  assert.strictEqual(r1.receipt_no, '0001');
  assert.strictEqual(r2.receipt_no, '0002');
}

async function test_r6_override_attribution() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice', { name: 'Alice Volunteer' });
  seedUser(store, 'eve', { role: 'executive', name: 'Eve Exec' });
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, {
    pickup_id: 'px1', override: true, override_reason: 'volunteer stuck',
    actual_weight_lbs: 25,
  }, 'eve');
  const r = store.getData('tax_receipts/rcpt_px1');
  // Receipt attributes the CLAIMANT (Alice), not the actor (Eve).
  assert.strictEqual(r.volunteer_name, 'Alice Volunteer', 'receipt attributes claimant, not exec actor');
  const comp = store.getData('pickup_completions/px1');
  assert.strictEqual(comp.claimant_uid, 'alice');
  assert.strictEqual(comp.actor_uid, 'eve');
  assert.strictEqual(comp.outcome, 'exec_override');
  assert.strictEqual(comp.override_reason, 'volunteer stuck');
}

async function test_r7_notification_in_transaction() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  seedRestaurant(store, 'rose-restaurant');
  await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  const safeKey = 'pickup:to_partner:complete:px1'.replace(/[\/\s]/g, '_').slice(0, 400);
  const work = store.getData(`notification_work/${safeKey}`);
  assert.ok(work, 'notification work created in tx');
  assert.strictEqual(work.scope, 'pickup');
  assert.deepStrictEqual(work.recipients, ['rose-owner']);
  assert.strictEqual(work.data.pickupId, 'px1');
}

async function test_rollback_on_exception() {
  const store = new Store();
  const ctx = stubRequire(store);
  // Precondition that triggers a mid-tx exception: pickup is
  // 'claimed' but caller is claimant and status requires enroute.
  seedPickup(store, 'px1', { status: 'claimed' });
  seedUser(store, 'alice');
  seedRestaurant(store, 'rose-restaurant');
  let threw = null;
  try {
    await run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice');
  } catch (e) { threw = e; }
  assert.ok(threw, 'tx must fail');
  assert.strictEqual(store.getData('pickups/px1').status, 'claimed', 'pickup not changed');
  assert.ok(!store.getData('pickup_completions/px1'), 'no sentinel');
  assert.ok(!store.getData('member_activity/pickup_px1'), 'no activity');
  assert.ok(!store.getData('tax_receipts/rcpt_px1'), 'no receipt');
}

async function test_concurrent_single_winner() {
  const store = new Store();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  seedRestaurant(store, 'rose-restaurant');
  // Two concurrent completions; the loser gets `cached` on retry
  // because the sentinel exists now.
  const [a, b] = await Promise.all([
    run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice'),
    run(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }, 'alice'),
  ]);
  const freshCount = (a.cached ? 0 : 1) + (b.cached ? 0 : 1);
  assert.strictEqual(freshCount, 1, 'exactly one of the two is fresh');
  const u = store.getData('users/alice');
  assert.strictEqual(u.events_attended, 1, 'exactly one bump total');
}

const tests = [
  ['happy path', test_happy],
  ['idempotent replay', test_idempotent_replay],
  ['R1 — override denied for non-exec', test_r1_override_not_exec],
  ['R1 — exec override requires reason', test_r1_override_requires_reason],
  ['R2 — cached read denied for unrelated user', test_r2_cached_unrelated_user_denied],
  ['R3 — spoiled replay returns cached', test_r3_spoiled_replay_cached],
  ['R3 — exec override unclaimed replay cached', test_r3_unclaimed_override_replay_cached],
  ['R5 — org_stats bumped in tx with all derived fields', test_r5_org_in_transaction],
  ['R6 — receipt has receipt_no + org identity + pickup stamp', test_r6_receipt_fields],
  ['R6 — receipt counter yields distinct sequential numbers', test_r6_receipt_counter_distinct],
  ['R6 — override attributes claimant on receipt, actor on sentinel', test_r6_override_attribution],
  ['R7 — notification work persisted inside tx', test_r7_notification_in_transaction],
  ['R8 — exception rolls back staged writes', test_rollback_on_exception],
  ['R8 — concurrent completions produce single winner', test_concurrent_single_winner],
];

(async () => {
  let failed = 0;
  for (const [desc, fn] of tests) {
    try { await fn(); console.log(`ok   ${desc}`); }
    catch (e) { failed += 1; console.error(`FAIL ${desc}:`, e?.message); if (e?.stack) console.error(e.stack); }
  }
  if (failed) { console.error(`${failed} case(s) failed`); process.exit(1); }
  console.log(`[C1 complete] all ${tests.length} cases passed ✓`);
})();
