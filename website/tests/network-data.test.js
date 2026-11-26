import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateDirectory, directoryCSV } from '../network-data.js';
const chapters = [{region:'Asia', members:null}, {region:'Asia', members:0}, {region:'Europe', members:12}, {members:-4}];
test('missing counts stay missing while a recorded zero stays zero', () => {
  const a = aggregateDirectory(chapters, 'members');
  assert.equal(a.missing, 2); assert.equal(a.total, 12);
  assert.equal(a.rows.find(r => r.region === 'Asia').value, 0);
  assert.equal(a.rows.find(r => r.region === 'Unspecified').value, null);
});
test('chapter totals do not depend on member completeness', () => {
  const a = aggregateDirectory(chapters);
  assert.equal(a.total, 4); assert.equal(a.rows[0].region, 'Asia'); assert.equal(a.rows[0].value, 2);
});
test('empty input is an empty directory, not invented records', () => {
  assert.deepEqual(aggregateDirectory([]), {rows:[], missing:0, total:0});
});
test('CSV quotes labels and exports missing counts as empty', () => {
  const a = aggregateDirectory([{region:'A "quoted" region', members:null}], 'members');
  const csv = directoryCSV(a.rows, 'members');
  assert.match(csv, /"A ""quoted"" region",,0,1/);
});
