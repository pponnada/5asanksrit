const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolated temp dir — must be set before requiring the app.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanskrit-backup-test-'));
const papersDir = path.join(tmpDir, 'papers');
fs.mkdirSync(papersDir);
process.env.PAPERS_DIR = papersDir;
process.env.LATEST_FILE = path.join(papersDir, 'latest.txt');
process.env.DB_FILE = path.join(tmpDir, 'app.db');

const app = require('../app');
const db = require('../db/db');

let server;
let base;
let adminCookie = null;

function seedRow() {
  const info = db
    .prepare(
      `INSERT INTO attempts (paper_id, start_ts, duration_minutes, status)
       VALUES (?, ?, ?, 'submitted')`
    )
    .run('backup-paper-1', 1700000000000, 20);
  db.prepare(
    `INSERT INTO answers (attempt_id, question_id, selected_option, answered_ts)
     VALUES (?, 'Q131', 'opt-a', 1700000001000)`
  ).run(info.lastInsertRowid);
  db.prepare(
    `INSERT INTO flashcard_progress
       (question_id, box, due_ts, correct_count, incorrect_count, last_result, last_seen_ts)
     VALUES ('Q131', 2, 1700000002000, 1, 0, 'correct', 1700000002000)`
  ).run();
  return Number(info.lastInsertRowid);
}

test.before(async () => {
  seedRow();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  // Log in as Teacher to get the session cookie for admin routes.
  const login = await fetch(`${base}/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'pin=1234',
    redirect: 'manual',
  });
  assert.equal(login.status, 302);
  const setCookies =
    typeof login.headers.getSetCookie === 'function'
      ? login.headers.getSetCookie()
      : [login.headers.get('set-cookie')].filter(Boolean);
  assert.ok(setCookies.length > 0, 'login should set a session cookie');
  adminCookie = setCookies.map((c) => c.split(';')[0]).join('; ');
});

test.after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function adminHeaders(extra = {}) {
  return Object.assign({ Cookie: adminCookie }, extra);
}

test('unauthenticated backup download redirects to login', async () => {
  const res = await fetch(`${base}/admin/backup`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/admin$/);
});

test('unauthenticated restore is rejected', async () => {
  const res = await fetch(`${base}/admin/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('junk'),
    redirect: 'manual',
  });
  assert.equal(res.status, 302);
});

test('dashboard shows the backup/restore UI', async () => {
  const res = await fetch(`${base}/admin/dashboard`, { headers: adminHeaders() });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Database backup/);
  assert.match(html, /Download backup/);
  assert.match(html, /Restore from a backup file/);
  assert.match(html, /id="restore-file"/);
});

test('backup download is a valid SQLite file', async () => {
  const res = await fetch(`${base}/admin/backup`, { headers: adminHeaders() });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') || '', /attachment/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 0, 'backup should not be empty');
  assert.equal(buf.subarray(0, 16).toString('latin1'), 'SQLite format 3\0');
});

test('restore rejects non-database uploads', async () => {
  const res = await fetch(`${base}/admin/restore`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/octet-stream' }),
    body: Buffer.from('this is definitely not a sqlite file, just text'),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.ok(body.error);
});

test('backup round-trip: wipe, restore, data comes back', async () => {
  // 1. Download a backup of the seeded data.
  const dl = await fetch(`${base}/admin/backup`, { headers: adminHeaders() });
  assert.equal(dl.status, 200);
  const backupBytes = Buffer.from(await dl.arrayBuffer());

  // 2. Wipe the live DB to simulate data loss.
  db.exec('DELETE FROM answers; DELETE FROM attempts; DELETE FROM flashcard_progress;');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 0);

  // 3. Restore from the downloaded bytes.
  const res = await fetch(`${base}/admin/restore`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/octet-stream' }),
    body: backupBytes,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.stats.attempts, 1);
  assert.equal(body.stats.answers, 1);
  assert.equal(body.stats.flashcards, 1);

  // 4. Live DB actually has the rows back, with values intact.
  const attempt = db.prepare('SELECT * FROM attempts WHERE paper_id = ?').get('backup-paper-1');
  assert.ok(attempt);
  assert.equal(attempt.status, 'submitted');
  const answer = db
    .prepare('SELECT * FROM answers WHERE attempt_id = ? AND question_id = ?')
    .get(attempt.id, 'Q131');
  assert.equal(answer.selected_option, 'opt-a');
  const card = db.prepare('SELECT * FROM flashcard_progress WHERE question_id = ?').get('Q131');
  assert.equal(card.box, 2);
});

test('backup-info reports live stats', async () => {
  const res = await fetch(`${base}/admin/backup-info`, { headers: adminHeaders() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.stats.attempts, 1);
  assert.ok(body.sizeLabel);
});
