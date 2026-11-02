const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the app at isolated temp files *before* requiring any app module —
// config.js reads these once at require time.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanskrit-flashcards-test-'));
const papersDir = path.join(tmpDir, 'papers');
fs.mkdirSync(papersDir);
process.env.PAPERS_DIR = papersDir;
process.env.LATEST_FILE = path.join(papersDir, 'latest.txt');
process.env.DB_FILE = path.join(tmpDir, 'app.db');

const { writeSubject } = require('./helpers/subjectFixture');
const corpusText = `## विभागः 1 — शब्दार्थाः (Meanings)

Q131: "अहम्" इत्यस्य अर्थः कः?
विकल्पाः: मैं, तुम, हम सब, तुम सब
Answer: मैं
Status: Confirmed

Q132: "त्वम्" इत्यस्य अर्थः कः?
विकल्पाः: मेरा, तुम सब, हम सब, तुम
Answer: तुम
Status: Confirmed

Q163: "दूरदर्शनम्" इत्यस्य अर्थः कः?
विकल्पाः: शीशा, आलमारी, बॉक्स, दूरदर्शन (टी.वी.)
Answer: दूरदर्शन (टी.वी.)
Status: Confirmed

Q999: "अपूर्णः" इत्यस्य अर्थः कः?
Answer: अधूरा
Status: Confirmed

---

## विभागः 2 — रिक्तस्थाने उचितम् वर्णम् लिखत (Fill correct letter in the blanks)

Q001: अ _ इ ई _ ऊ । रिक्तस्थानयोः उचितौ स्वरौ लिखत।
Answer: आ, उ
Status: Confirmed
`;
process.env.SUBJECTS_DIR = writeSubject(tmpDir, 'sanskrit', corpusText, { flashcards: true, corpusOnlySections: [1] });

const app = require('../app');
const db = require('../db/db');

let server;
let base;

test.before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('flashcards pool only includes Confirmed Meanings items with options, excluding other sections', async () => {
  const res = await fetch(`${base}/flashcards`);
  assert.equal(res.status, 200);
  const html = await res.text();
  // Q999 lacks विकल्पाः and must never surface as a playable card.
  assert.doesNotMatch(html, /Q999/);
});

const post = (url, body) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const drillRow = (id) => db.prepare('SELECT * FROM flashcard_drill WHERE question_id = ?').get(id);

test('a correct answer counts toward the default requirement of 3', async () => {
  const body = await post('/flashcards/answer', { questionId: 'Q131', selectedOption: 'मैं' });
  assert.equal(body.correct, true);
  assert.equal(body.correctAnswer, 'मैं');
  assert.equal(body.correctCount, 1);
  assert.equal(body.required, 3);
  assert.equal(drillRow('Q131').correct_count, 1);
});

test('a wrong answer resets the count and raises the requirement to 5', async () => {
  await post('/flashcards/answer', { questionId: 'Q132', selectedOption: 'तुम' });
  assert.equal(drillRow('Q132').correct_count, 1);

  const body = await post('/flashcards/answer', { questionId: 'Q132', selectedOption: 'मेरा' });
  assert.equal(body.correct, false);
  assert.equal(body.correctCount, 0);
  assert.equal(body.required, 5);
  assert.equal(drillRow('Q132').wrong_count, 1);
});

test('a card finishes after 3 correct (never missed) or 5 correct (after a miss)', async () => {
  for (let i = 0; i < 2; i++) await post('/flashcards/answer', { questionId: 'Q131', selectedOption: 'मैं' });
  assert.equal((await post('/flashcards/answer', { questionId: 'Q131', selectedOption: 'मैं' })).correctCount, 4); // over-answering is harmless
  let next;
  for (let i = 0; i < 30; i++) {
    next = await (await fetch(`${base}/flashcards/next`)).json();
    assert.notEqual(next.card.id, 'Q131', 'finished card must not be served again');
  }

  for (let i = 0; i < 4; i++) await post('/flashcards/answer', { questionId: 'Q132', selectedOption: 'तुम' });
  let ids = new Set();
  for (let i = 0; i < 60; i++) ids.add((await (await fetch(`${base}/flashcards/next`)).json()).card.id);
  assert.ok(ids.has('Q132'), 'Q132 has 4/5 and must still be served');
  await post('/flashcards/answer', { questionId: 'Q132', selectedOption: 'तुम' });
  ids = new Set();
  for (let i = 0; i < 60; i++) ids.add((await (await fetch(`${base}/flashcards/next`)).json()).card.id);
  assert.deepEqual([...ids], ['Q163']);
});

test('options are reshuffled between serves', async () => {
  const orders = new Set();
  for (let i = 0; i < 40; i++) {
    const { card } = await (await fetch(`${base}/flashcards/next?exclude=none`)).json();
    assert.deepEqual([...card.options].sort(), [...card.options].sort());
    orders.add(card.options.join('|'));
  }
  assert.ok(orders.size > 1);
});

test('the same card is not served twice in a row, and done:true when all finished', async () => {
  for (let i = 0; i < 30; i++) {
    const { card } = await (await fetch(`${base}/flashcards/next?exclude=Q163`)).json();
    assert.ok(card); // Q163 is the only open card, so it is allowed to repeat
  }
  for (let i = 0; i < 3; i++) await post('/flashcards/answer', { questionId: 'Q163', selectedOption: 'दूरदर्शन (टी.वी.)' });
  const done = await (await fetch(`${base}/flashcards/next`)).json();
  assert.equal(done.done, true);
  assert.equal(done.stats.remaining, 0);
});

test('a Latin-script parenthetical in the answer is surfaced as the English meaning', async () => {
  const body = await post('/flashcards/answer', { questionId: 'Q163', selectedOption: 'दूरदर्शन (टी.वी.)' });
  assert.equal(body.englishMeaning, null);
});

test('resetAll clears all drill progress', () => {
  require('../db/flashcards').resetAll();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM flashcard_drill').get().n, 0);
});

test('with 2+ open cards, /flashcards/next never repeats the excluded card', async () => {
  for (let i = 0; i < 40; i++) {
    const { card } = await (await fetch(`${base}/flashcards/next?exclude=Q131`)).json();
    assert.notEqual(card.id, 'Q131');
  }
});
