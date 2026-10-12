// Exercise the actual client adapter source, including its UI error contract.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const parser = require('@babel/parser');
const source = fs.readFileSync(require.resolve('../src/services/database.js'), 'utf8');
const ast = parser.parse(source, { sourceType: 'module' });
const names = new Set(['invokePickupCompletion', 'completePickup', 'reportPickupSpoiled']);
const declarations = ast.program.body.map((node) => node.declaration || node)
  .filter((node) => node.type === 'FunctionDeclaration' && names.has(node.id.name));
assert.equal(declarations.length, 3);
const actual = declarations.map((node) => source.slice(node.start, node.end)).join('\n').replace(/\bimport\(/g, 'loadModule(');
let calls = [], response = { ok: true, cached: false, receipt_id: 'rcpt_p' }, failure;
const adapter = new Function('useMock', 'isFirebaseConfigured', 'loadModule', `${actual}; return { completePickup, reportPickupSpoiled };`)(
  () => false, true, async (name) => {
    assert.equal(name, 'firebase/functions');
    return { getFunctions: () => ({}), httpsCallable: (_, callable) => async (payload) => {
      assert.equal(callable, 'completePickupOperation'); calls.push(payload);
      if (failure) throw failure;
      return { data: response };
    } };
  });
(async () => {
  assert.equal((await adapter.completePickup('p', 20)).receipt_id, 'rcpt_p');
  assert.equal(calls.length, 1); assert.equal(calls[0].actual_weight_lbs, 20);
  response = { ...response, cached: true };
  assert.equal((await adapter.completePickup('p', 20)).cached, true);
  await adapter.completePickup('p', 20, { override: true, overrideReason: 'Officer confirmed delivery' });
  assert.equal(calls[2].override_reason, 'Officer confirmed delivery');
  await adapter.reportPickupSpoiled('p', { kind: 'fridge_full', note: 'Destination unavailable' });
  assert.equal(calls[3].spoiled, true); assert.equal(calls[3].spoiled_kind, 'fridge_full');
  failure = Object.assign(new Error('Restaurant has not confirmed'), {
    code: 'functions/failed-precondition', details: { reason: 'handoff_not_confirmed' },
  });
  await assert.rejects(adapter.completePickup('p', 20), (error) => error.code === 'handoff_not_confirmed');
  failure = Object.assign(new Error('offline'), { code: 'functions/unavailable' });
  await assert.rejects(adapter.completePickup('p', 20), (error) => error.code === 'functions/unavailable');
  console.log('C1 client: all 6 adapter cases passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
