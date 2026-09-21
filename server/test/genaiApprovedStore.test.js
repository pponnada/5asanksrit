const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSectionPool, appendApprovedItems, loadAllCounts } = require('../content/genaiApprovedStore');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'genai-store-test-'));
}

test('appendApprovedItems assigns sequential G<NN>-seq ids starting at 001', () => {
  const dir = tmpDir();
  const stamped = appendApprovedItems(
    9,
    [
      { stem: 'stem1', options: ['a', 'b', 'c', 'd'], answer: 'a', note: 'n1' },
      { stem: 'stem2', options: ['a', 'b', 'c', 'd'], answer: 'b' },
    ],
    dir
  );

  assert.equal(stamped[0].id, 'G09-001');
  assert.equal(stamped[1].id, 'G09-002');
  assert.equal(stamped[0].status, 'Confirmed');
  assert.equal(stamped[0].sourceSection, 'विभागः 9');
  assert.ok(stamped[0].approved);
  assert.equal(stamped[1].note, null);
});

test('appendApprovedItems continues numbering from the existing max seq on re-append', () => {
  const dir = tmpDir();
  appendApprovedItems(9, [{ stem: 's1', options: ['a', 'b'], answer: 'a' }], dir);
  const second = appendApprovedItems(9, [{ stem: 's2', options: ['a', 'b'], answer: 'b' }], dir);

  assert.equal(second[0].id, 'G09-002');
  assert.equal(loadSectionPool(9, dir).length, 2);
});

test('loadSectionPool returns [] for a section with no pool file yet', () => {
  const dir = tmpDir();
  assert.deepEqual(loadSectionPool(9, dir), []);
});

test('loadAllCounts sums per-section counts across files', () => {
  const dir = tmpDir();
  appendApprovedItems(9, [{ stem: 's1', options: ['a', 'b'], answer: 'a' }], dir);
  appendApprovedItems(9, [{ stem: 's2', options: ['a', 'b'], answer: 'b' }], dir);
  appendApprovedItems(12, [{ stem: 's3', options: ['a', 'b'], answer: 'a' }], dir);

  const counts = loadAllCounts(dir);
  assert.equal(counts[9], 2);
  assert.equal(counts[12], 1);
});
