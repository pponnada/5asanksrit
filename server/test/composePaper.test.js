const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// composePaper.js reads CORPUS_FILE/GENAI_APPROVED_DIR/PAPERS_DIR from
// config.js at require time, so these env vars must be set before it (or
// config.js) is required anywhere — same pattern as attemptLifecycle.test.js.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-paper-test-'));
const corpusFile = path.join(tmpDir, 'qa-corpus.md');
const genaiDir = path.join(tmpDir, 'genai-approved');
const papersDir = path.join(tmpDir, 'papers');
fs.mkdirSync(genaiDir);
fs.mkdirSync(papersDir);

fs.writeFileSync(
  corpusFile,
  `# QA Corpus

## विभागः 1 — शब्दार्थाः (Meanings)

Q001: प्रश्नः १?
विकल्पाः: अ, आ, इ, ई
Answer: अ
Status: Confirmed

Q002: प्रश्नः २?
विकल्पाः: अ, आ, इ, ई
Answer: आ
Status: Confirmed

## विभागः 9 — testing (Testing)

Q010: प्रश्नः ३?
विकल्पाः: क, ख, ग, घ
Answer: क
Status: Confirmed
`,
  'utf8'
);

process.env.CORPUS_FILE = corpusFile;
process.env.GENAI_APPROVED_DIR = genaiDir;
process.env.PAPERS_DIR = papersDir;

const { composePaper } = require('../content/composePaper');
const { parsePaperFile } = require('../content/parsePaper');

test('composes a Draft (no Published-At) with the requested sections and time limit', () => {
  const draft = {
    timeLimitMinutes: 20,
    sections: [
      { number: 9, count: 1 },
      { number: 1, count: 1 },
    ],
  };

  const id = composePaper(draft);
  const filePath = path.join(papersDir, id + '.md');
  assert.ok(fs.existsSync(filePath));

  const paper = parsePaperFile(filePath);
  assert.equal(paper.timeLimitMinutes, 20);
  assert.equal(paper.publishedAt, null);
  assert.deepEqual(paper.sections, ['विभागः 1', 'विभागः 9']); // ascending order, not selection order
  assert.equal(paper.items.length, 2);

  const ids = paper.items.map((i) => i.id);
  assert.ok(ids.includes('Q010')); // only usable item in विभागः 9
  assert.ok(ids.includes('Q001') || ids.includes('Q002'));
});

test('draws a section\'s count from its bank (native usable + GenAI-approved) without duplicates', () => {
  fs.writeFileSync(
    path.join(genaiDir, 'vibhaga-09.json'),
    JSON.stringify([{ id: 'G09-001', stem: 'banked item', options: ['a', 'b'], answer: 'a', status: 'Confirmed' }]),
    'utf8'
  );

  const draft = {
    timeLimitMinutes: 15,
    sections: [{ number: 9, count: 2 }], // विभागः 9's whole bank: Q010 (corpus) + G09-001 (GenAI-approved)
  };

  const id = composePaper(draft);
  const paper = parsePaperFile(path.join(papersDir, id + '.md'));

  const ids = paper.items.map((i) => i.id);
  assert.equal(ids.length, new Set(ids).size, 'no duplicate item ids in the composed paper');
  assert.deepEqual(new Set(ids), new Set(['Q010', 'G09-001']));
});
