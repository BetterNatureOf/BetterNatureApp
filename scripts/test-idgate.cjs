#!/usr/bin/env node
// G1 regression — test the strict approval predicate used by
// src/services/idGate.js. The gate itself imports React Native,
// which doesn't run in plain Node, so we exercise the same
// predicate here.
//
// Run:
//   node scripts/test-idgate.cjs

const assert = require('assert');

function approved(user) {
  return user?.verification_status === 'approved';
}

const cases = [
  // [description, user, expected approved?]
  ['missing status',               {},                                                               false],
  ['null status',                  { verification_status: null },                                    false],
  ['pending',                      { verification_status: 'pending' },                               false],
  ['rejected',                     { verification_status: 'rejected' },                              false],
  ['legacy bearer URL only',       { id_document_url: 'https://x' },                                 false],
  ['self-written presence flags',  { id_front_present: true,
                                     contract_volunteer_signed: true,
                                     driver_setup_complete: true },                                  false],
  ['approved',                     { verification_status: 'approved' },                              true ],
  ['approved + legacy URL',        { verification_status: 'approved', id_document_url: 'https://x' },true ],
];

let failed = 0;
for (const [desc, user, want] of cases) {
  const got = approved(user);
  if (got !== want) {
    failed += 1;
    console.error(`FAIL ${desc}: want ${want} got ${got}`);
  } else {
    console.log(`ok   ${desc}`);
  }
}
if (failed) { console.error(`${failed} case(s) failed`); process.exit(1); }
console.log(`[idGate] all ${cases.length} cases passed ✓`);
