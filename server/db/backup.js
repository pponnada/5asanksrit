const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const db = require('./db');
const { DB_FILE } = require('../config');

const REQUIRED_TABLES = ['attempts', 'answers', 'flashcard_progress'];
const SQLITE_MAGIC = 'SQLite format 3\0';
const MAX_RESTORE_BYTES = 100 * 1024 * 1024;

function hasSqliteMagic(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    if (n < 16) return false;
    return buf.toString('latin1', 0, 16) === SQLITE_MAGIC;
  } finally {
    fs.closeSync(fd);
  }
}

function getStats() {
  const attempts = db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n;
  const answers = db.prepare('SELECT COUNT(*) AS n FROM answers').get().n;
  const flashcards = db.prepare('SELECT COUNT(*) AS n FROM flashcard_progress').get().n;
  let dbSizeBytes = null;
  try {
    dbSizeBytes = fs.statSync(DB_FILE).size;
  } catch {
    dbSizeBytes = null;
  }
  return { attempts, answers, flashcards, dbSizeBytes };
}

/**
 * Creates a consistent single-file snapshot of the live DB using
 * `VACUUM INTO`, which works while the DB is open (incl. WAL mode) and
 * produces a clean file with no -wal/-shm sidecars. Returns the temp path;
 * the caller owns cleanup.
 */
function createBackupFile() {
  const tmpPath = path.join(
    os.tmpdir(),
    `sanskrit-backup-${Date.now()}-${process.pid}.db`
  );
  db.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
  return tmpPath;
}

function backupFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `sanskrit-backup-${stamp}.db`;
}

/**
 * Opens `filePath` read-only in a throwaway connection and checks it looks
 * like one of our app databases. Never touches the live connection.
 * Returns { ok: true, stats } or { ok: false, error }.
 */
function validateBackupFile(filePath) {
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return { ok: false, error: 'Backup file is missing.' };
  }
  if (size === 0) return { ok: false, error: 'Backup file is empty.' };
  if (size > MAX_RESTORE_BYTES) return { ok: false, error: 'Backup file is too large (max 100 MB).' };
  if (!hasSqliteMagic(filePath)) {
    return { ok: false, error: 'Not a SQLite database file.' };
  }

  let src = null;
  try {
    src = new Database(filePath, { readonly: true });
    const integrity = src.prepare('PRAGMA integrity_check').get();
    if (!integrity || integrity.integrity_check !== 'ok') {
      return { ok: false, error: 'Backup file failed integrity check.' };
    }
    const tables = new Set(
      src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    );
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missing.length > 0) {
      return { ok: false, error: `Backup is missing tables: ${missing.join(', ')}.` };
    }
    const stats = {
      attempts: src.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,
      answers: src.prepare('SELECT COUNT(*) AS n FROM answers').get().n,
      flashcards: src.prepare('SELECT COUNT(*) AS n FROM flashcard_progress').get().n,
    };
    return { ok: true, stats };
  } catch (err) {
    return { ok: false, error: 'Could not read backup file: ' + err.message };
  } finally {
    if (src) src.close();
  }
}

/**
 * Replaces the live DB contents with the rows from a validated backup file.
 * Logical copy (rows, not file swap) so the live better-sqlite3 connection
 * and its prepared statements stay valid — no restart needed.
 */
function restoreFromBackupFile(filePath) {
  const validation = validateBackupFile(filePath);
  if (!validation.ok) {
    const err = new Error(validation.error);
    err.status = 400;
    throw err;
  }

  const src = new Database(filePath, { readonly: true });
  try {
    const attempts = src.prepare('SELECT * FROM attempts').all();
    const answers = src.prepare('SELECT * FROM answers').all();
    const progress = src.prepare('SELECT * FROM flashcard_progress').all();

    const restore = db.transaction(() => {
      db.exec('DELETE FROM answers; DELETE FROM attempts; DELETE FROM flashcard_progress;');

      const insertAttempt = db.prepare(
        `INSERT INTO attempts (id, paper_id, start_ts, duration_minutes, submit_ts, status)
         VALUES (@id, @paper_id, @start_ts, @duration_minutes, @submit_ts, @status)`
      );
      for (const row of attempts) insertAttempt.run(row);

      const insertAnswer = db.prepare(
        `INSERT INTO answers (attempt_id, question_id, selected_option, answered_ts)
         VALUES (@attempt_id, @question_id, @selected_option, @answered_ts)`
      );
      for (const row of answers) insertAnswer.run(row);

      const insertProgress = db.prepare(
        `INSERT INTO flashcard_progress
           (question_id, box, due_ts, correct_count, incorrect_count, last_result, last_seen_ts)
         VALUES
           (@question_id, @box, @due_ts, @correct_count, @incorrect_count, @last_result, @last_seen_ts)`
      );
      for (const row of progress) insertProgress.run(row);

      // Keep AUTOINCREMENT from reusing ids that exist in the backup.
      const maxId = attempts.reduce((m, r) => Math.max(m, r.id || 0), 0);
      db.exec('DELETE FROM sqlite_sequence WHERE name = \'attempts\'');
      if (maxId > 0) {
        db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('attempts', ?)").run(maxId);
      }
    });
    restore();

    // Checkpoint so the restored rows are durable in the main db file, not
    // just lingering in the WAL.
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // Non-fatal: restore already committed.
    }

    return validation.stats;
  } finally {
    src.close();
  }
}

module.exports = {
  getStats,
  createBackupFile,
  backupFilename,
  validateBackupFile,
  restoreFromBackupFile,
  MAX_RESTORE_BYTES,
};
