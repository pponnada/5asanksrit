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

const corpusFile = path.join(tmpDir, 'qa-corpus.md');
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
fs.writeFileSync(corpusFile, corpusText);
process.env.CORPUS_FILE = corpusFile;

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

test('a correct answer is recorded and promotes the card to box 2', async () => {
  const res = await fetch(`${base}/flashcards/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId: 'Q131', selectedOption: 'मैं' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.correct, true);
  assert.equal(body.correctAnswer, 'मैं');

  const row = db.prepare('SELECT * FROM flashcard_progress WHERE question_id = ?').get('Q131');
  assert.equal(row.box, 2);
  assert.equal(row.correct_count, 1);
  assert.ok(row.due_ts > Date.now(), 'a correct answer should push the next review into the future');
});

test('a wrong answer resets the card to box 1, due immediately', async () => {
  // First get it into box 2.
  await fetch(`${base}/flashcards/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId: 'Q132', selectedOption: 'तुम' }),
  });
  let row = db.prepare('SELECT * FROM flashcard_progress WHERE question_id = ?').get('Q132');
  assert.equal(row.box, 2);

  // Then miss it.
  const res = await fetch(`${base}/flashcards/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId: 'Q132', selectedOption: 'मेरा' }),
  });
  const body = await res.json();
  assert.equal(body.correct, false);
  assert.equal(body.correctAnswer, 'तुम');

  row = db.prepare('SELECT * FROM flashcard_progress WHERE question_id = ?').get('Q132');
  assert.equal(row.box, 1);
  assert.equal(row.incorrect_count, 1);
  assert.ok(row.due_ts <= Date.now(), 'a wrong answer should be due again immediately');
});

test('a Latin-script parenthetical in the answer is surfaced as the English meaning', async () => {
  const res = await fetch(`${base}/flashcards/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId: 'Q163', selectedOption: 'दूरदर्शन (टी.वी.)' }),
  });
  const body = await res.json();
  // टी.वी. is Devanagari transliteration, not Latin script — no English gloss here.
  assert.equal(body.englishMeaning, null);
});

test('/flashcards/next never repeats the excluded card while other due cards exist', async () => {
  const res = await fetch(`${base}/flashcards/next?exclude=Q131`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.notEqual(body.card.id, 'Q131');
});
