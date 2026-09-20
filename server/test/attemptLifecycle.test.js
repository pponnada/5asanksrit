const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point the app at an isolated temp directory *before* requiring any app
// module — config.js reads these once at require time.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanskrit-test-'));
const papersDir = path.join(tmpDir, 'papers');
fs.mkdirSync(papersDir);
process.env.PAPERS_DIR = papersDir;
process.env.LATEST_FILE = path.join(papersDir, 'latest.txt');
process.env.DB_FILE = path.join(tmpDir, 'app.db');

const PAPER_ID = '2099-01-01-0000';
const paperText = `# Paper ${PAPER_ID}

Sections: विभागः 1
Time-Limit-Minutes: 10
Composed-At: 2099-01-01T00:00:00Z
Published-At: 2099-01-01T00:00:00Z

Q131: "अहम्" इत्यस्य अर्थः कः?
विकल्पाः: मैं, तुम, हम सब, तुम सब
Answer: मैं

Q132: "त्वम्" इत्यस्य अर्थः कः?
विकल्पाः: मेरा, तुम सब, हम सब, तुम
Answer: तुम
`;
fs.writeFileSync(path.join(papersDir, PAPER_ID + '.md'), paperText);
fs.writeFileSync(process.env.LATEST_FILE, PAPER_ID + '\n');

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

async function answer(questionId, selectedOption) {
  return fetch(`${base}/test/${PAPER_ID}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, selectedOption }),
  });
}

test('starting a paper creates one attempt; revisiting does not reset the timer', async () => {
  const first = await fetch(`${base}/test/${PAPER_ID}`, { redirect: 'follow' });
  assert.equal(first.status, 200); // followed through to question/1

  const rowAfterFirst = db.prepare('SELECT * FROM attempts WHERE paper_id = ?').get(PAPER_ID);
  assert.ok(rowAfterFirst, 'attempt row should exist');
  const startTs = rowAfterFirst.start_ts;

  // Simulate the Student closing the browser and coming back later.
  await new Promise((r) => setTimeout(r, 20));
  await fetch(`${base}/test/${PAPER_ID}`, { redirect: 'follow' });

  const rowAfterSecond = db.prepare('SELECT * FROM attempts WHERE paper_id = ?').get(PAPER_ID);
  assert.equal(rowAfterSecond.start_ts, startTs, 'start_ts must not change on revisit');
});

test('answers persist incrementally as they are made', async () => {
  const res = await answer('Q131', 'मैं');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  const row = db
    .prepare(
      `SELECT a.selected_option FROM answers a
       JOIN attempts t ON t.id = a.attempt_id
       WHERE t.paper_id = ? AND a.question_id = 'Q131'`
    )
    .get(PAPER_ID);
  assert.equal(row.selected_option, 'मैं');
});

test('expiry is enforced server-side on the next request, even without a manual submit', async () => {
  const attempt = db.prepare('SELECT * FROM attempts WHERE paper_id = ?').get(PAPER_ID);
  assert.equal(attempt.status, 'in_progress');

  // Rewind start_ts so the 10-minute paper reads as already expired,
  // simulating "time ran out while the browser was closed."
  db.prepare('UPDATE attempts SET start_ts = ? WHERE id = ?').run(
    Date.now() - 11 * 60 * 1000,
    attempt.id
  );

  const res = await fetch(`${base}/test/${PAPER_ID}`, { redirect: 'follow' });
  assert.equal(res.status, 200); // followed through to the review page

  const finalized = db.prepare('SELECT * FROM attempts WHERE paper_id = ?').get(PAPER_ID);
  assert.equal(finalized.status, 'auto_submitted');
  assert.ok(finalized.submit_ts, 'submit_ts should be set');

  // The one answer saved before expiry must have carried through.
  const savedAnswer = db
    .prepare(
      `SELECT selected_option FROM answers a JOIN attempts t ON t.id = a.attempt_id
       WHERE t.paper_id = ? AND question_id = 'Q131'`
    )
    .get(PAPER_ID);
  assert.equal(savedAnswer.selected_option, 'मैं');
});

test('a finalized attempt can never be re-entered or re-answered', async () => {
  const startAgain = await fetch(`${base}/test/${PAPER_ID}`, { redirect: 'manual' });
  assert.equal(startAgain.status, 302);
  assert.match(startAgain.headers.get('location'), /\/review$/);

  const answerAgain = await answer('Q132', 'तुम');
  assert.equal(answerAgain.status, 409);
});
