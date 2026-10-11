#!/usr/bin/env node
// C1 — idempotency tests for completePickupOperation.
//
// These tests exercise the invariants the callable must uphold.
// They do NOT run the Firebase Functions emulator (that requires
// Java 17 + the full emulator suite); instead they load the
// candidate source and replace `firebase-admin` with a minimal
// in-process mock that preserves transaction semantics for the
// writes we care about.
//
// Run:
//   node scripts/test-c1-complete.cjs

const assert = require('assert');
const path = require('path');
const Module = require('module');

// ── Minimal in-process Firestore mock ────────────────────────────
function makeStore() {
  // key → doc.data
  const docs = new Map();
  // path -> array of events for assertions
  const writes = [];
  return { docs, writes };
}
function sentinelsResolve(data) {
  // Shallow unwrap of our mock FieldValue sentinels.
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__fieldvalue === 'serverTimestamp') out[k] = new Date();
    else if (v && v.__fieldvalue === 'increment') out[k] = v.amount; // base value — merged below
    else out[k] = v;
  }
  return out;
}
function applyIncrementsOnMerge(prev, next) {
  const out = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (v && v.__fieldvalue === 'increment') out[k] = (prev[k] || 0) + v.amount;
    else if (v && v.__fieldvalue === 'serverTimestamp') out[k] = new Date();
    else out[k] = v;
  }
  return out;
}

function buildAdminStub(store, { onTxAttempt } = {}) {
  const FieldValue = {
    serverTimestamp: () => ({ __fieldvalue: 'serverTimestamp' }),
    increment: (amount) => ({ __fieldvalue: 'increment', amount }),
  };
  function docRef(docPath) {
    return {
      path: docPath,
      async get() {
        return {
          exists: store.docs.has(docPath),
          data: () => store.docs.get(docPath),
          ref: this,
        };
      },
      async set(data, opts) {
        store.writes.push({ op: 'set', path: docPath, data, opts });
        const resolved = sentinelsResolve(data);
        if (opts && opts.merge) {
          store.docs.set(docPath, applyIncrementsOnMerge(store.docs.get(docPath) || {}, data));
        } else {
          store.docs.set(docPath, resolved);
        }
      },
      async update(data) {
        store.writes.push({ op: 'update', path: docPath, data });
        store.docs.set(docPath, applyIncrementsOnMerge(store.docs.get(docPath) || {}, data));
      },
      async create(data) {
        if (store.docs.has(docPath)) {
          const e = new Error('ALREADY_EXISTS');
          e.code = 6;
          throw e;
        }
        store.writes.push({ op: 'create', path: docPath, data });
        store.docs.set(docPath, sentinelsResolve(data));
      },
      async delete() {
        store.writes.push({ op: 'delete', path: docPath });
        store.docs.delete(docPath);
      },
    };
  }
  function collectionRef(colPath) {
    return {
      doc(id) { return docRef(`${colPath}/${id}`); },
      async add(data) {
        const id = `auto_${Math.random().toString(36).slice(2, 10)}`;
        const r = docRef(`${colPath}/${id}`);
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
        if (onTxAttempt) onTxAttempt();
        // Build a tx shim mirroring the admin API we use (get / set / create / update / delete).
        const tx = {
          get: (ref) => ref.get(),
          set: (ref, data, opts) => ref.set(data, opts),
          update: (ref, data) => ref.update(data),
          create: (ref, data) => ref.create(data),
          delete: (ref) => ref.delete(),
        };
        return fn(tx);
      },
    };
  }
  firestore.FieldValue = FieldValue;
  firestore.Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms, _ms: ms }) };
  return {
    firestore,
    initializeApp: () => {},
    apps: [{}],
    storage: () => ({ bucket: () => ({ file: () => ({ exists: async () => [false] }) }) }),
    auth: () => ({ getUser: async () => ({ emailVerified: true, email: 'x@y' }) }),
  };
}

// Intercept require('firebase-admin') + 'firebase-functions' so we
// can inject the mock + simulate the HttpsError + onCall contract.
function stubRequire(store) {
  const originalResolve = Module._resolveFilename;
  const originalLoad = Module._load;
  const admin = buildAdminStub(store);
  // Grab the handler so we can call it directly.
  let registeredHandler = null;
  const functionsMock = {
    https: {
      onCall: (fn) => {
        registeredHandler = fn;
        return fn;
      },
      HttpsError: class HttpsError extends Error {
        constructor(code, message) { super(message); this.code = code; this.name = 'HttpsError'; }
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
  // Preload the candidate source.
  delete require.cache[require.resolve('../functions/completePickup.js')];
  require('../functions/completePickup.js');
  Module._load = originalLoad;
  return { admin, functionsMock, getHandler: () => registeredHandler };
}

// ── Fixture helpers ──────────────────────────────────────────────
function seedPickup(store, pickupId, overrides = {}) {
  store.docs.set(`pickups/${pickupId}`, {
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
  });
}
function seedUser(store, uid, overrides = {}) {
  store.docs.set(`users/${uid}`, {
    role: 'member', member_status: 'approved', disabled: false,
    name: 'Alice', ...overrides,
  });
}

// ── Tests ────────────────────────────────────────────────────────
async function runOne(ctx, data) {
  return ctx.getHandler()(data, { auth: { uid: data._caller || 'alice' } });
}

async function test_happyPath() {
  const store = makeStore();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  const res = await runOne(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.cached, false);
  // Pickup transitioned.
  assert.strictEqual(store.docs.get('pickups/px1').status, 'completed');
  // Member activity has the deterministic id.
  assert.ok(store.docs.has('member_activity/pickup_px1'), 'activity doc created with deterministic id');
  // Receipt has the deterministic id.
  assert.ok(store.docs.has('tax_receipts/rcpt_px1'), 'receipt doc created with deterministic id');
  // User totals bumped.
  const u = store.docs.get('users/alice');
  assert.strictEqual(u.events_attended, 1);
  assert.ok(u.lbs_rescued >= 20, 'lbs_rescued bumped');
}

async function test_idempotentReplay() {
  const store = makeStore();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  await runOne(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 });
  const beforeWrites = store.writes.length;
  const res2 = await runOne(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 });
  assert.strictEqual(res2.cached, true);
  // No additional pickup/activity/receipt writes.
  const activityWrites = store.writes.filter((w) => w.path === 'member_activity/pickup_px1');
  assert.strictEqual(activityWrites.length, 1, 'exactly one activity write across both calls');
  const receiptWrites = store.writes.filter((w) => w.path === 'tax_receipts/rcpt_px1');
  assert.strictEqual(receiptWrites.length, 1, 'exactly one receipt write across both calls');
  // User totals NOT double-bumped.
  const u = store.docs.get('users/alice');
  assert.strictEqual(u.events_attended, 1, 'events_attended still 1 after replay');
}

async function test_unauthorized() {
  const store = makeStore();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');  // claimed_by = alice
  seedUser(store, 'bob');     // non-exec, non-claimant
  let threw = null;
  try {
    await runOne(ctx, { pickup_id: 'px1', actual_weight_lbs: 20, _caller: 'bob' });
  } catch (e) { threw = e; }
  assert.ok(threw, 'should throw on unauthorized');
  assert.strictEqual(threw.code, 'permission-denied');
}

async function test_missingWeight() {
  const store = makeStore();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  let threw = null;
  try { await runOne(ctx, { pickup_id: 'px1' }); } catch (e) { threw = e; }
  assert.ok(threw);
  assert.strictEqual(threw.code, 'invalid-argument');
}

async function test_wrongStatus() {
  const store = makeStore();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1', { status: 'claimed' });
  seedUser(store, 'alice');
  let threw = null;
  try { await runOne(ctx, { pickup_id: 'px1', actual_weight_lbs: 20 }); } catch (e) { threw = e; }
  assert.ok(threw);
  assert.strictEqual(threw.code, 'failed-precondition');
}

async function test_spoiled_noReceipt() {
  const store = makeStore();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1');
  seedUser(store, 'alice');
  const res = await runOne(ctx, { pickup_id: 'px1', spoiled: true, spoiled_kind: 'food_spoiled' });
  assert.strictEqual(res.spoiled, true);
  assert.strictEqual(store.docs.get('pickups/px1').status, 'completed');
  assert.strictEqual(store.docs.get('pickups/px1').spoiled, true);
  assert.strictEqual(store.docs.get('pickups/px1').actual_weight_lbs, 0);
  assert.ok(!store.docs.has('tax_receipts/rcpt_px1'), 'spoiled must not mint receipt');
}

async function test_execOverride() {
  const store = makeStore();
  const ctx = stubRequire(store);
  seedPickup(store, 'px1', { status: 'claimed' }); // not enroute
  seedUser(store, 'eve', { role: 'executive' });
  const res = await runOne(ctx, { pickup_id: 'px1', actual_weight_lbs: 15, override: true, _caller: 'eve' });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(store.docs.get('pickups/px1').status, 'completed');
}

const tests = [
  ['happy path writes all deterministic docs', test_happyPath],
  ['idempotent replay returns cached',          test_idempotentReplay],
  ['unauthorized caller denied',                test_unauthorized],
  ['missing weight invalid-argument',           test_missingWeight],
  ['wrong status failed-precondition',          test_wrongStatus],
  ['spoiled sets weight=0 and no receipt',      test_spoiled_noReceipt],
  ['exec override bypasses enroute gate',       test_execOverride],
];

(async () => {
  let failed = 0;
  for (const [desc, fn] of tests) {
    try { await fn(); console.log(`ok   ${desc}`); }
    catch (e) { failed += 1; console.error(`FAIL ${desc}:`, e?.message || e); if (e?.stack) console.error(e.stack); }
  }
  if (failed) { console.error(`${failed} case(s) failed`); process.exit(1); }
  console.log(`[C1 complete] all ${tests.length} cases passed ✓`);
})();
