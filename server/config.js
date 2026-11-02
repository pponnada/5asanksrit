const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');

// Each subject (sanskrit, math, ...) lives in its own folder under
// SUBJECTS_DIR: subject.json, corpus.md and genai-approved/ (see
// content/subjects.js). Composed papers from every subject share PAPERS_DIR,
// tagged with a "Subject:" header.
const SUBJECTS_DIR = process.env.SUBJECTS_DIR || path.join(ROOT, 'subjects');

// Content/DB locations can be overridden via env vars, pointing the app at
// an isolated temp directory — used by the test suite so it never touches
// the real corpus/papers/data in this repo.
const PAPERS_DIR = process.env.PAPERS_DIR || path.join(ROOT, 'papers');

module.exports = {
  ROOT,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  TEACHER_PIN: process.env.TEACHER_PIN || '1234',
  SESSION_SECRET: process.env.SESSION_SECRET || 'sanskrit-app-dev-secret-change-me',
  SUBJECTS_DIR,
  // Papers with no "Subject:" header (everything composed before subjects
  // existed) belong to this subject, and its "latest" pointer stays in
  // LATEST_FILE (papers/latest.txt) so existing data needs no migration.
  DEFAULT_SUBJECT: process.env.DEFAULT_SUBJECT || 'sanskrit',
  PAPERS_DIR,
  LATEST_FILE: process.env.LATEST_FILE || path.join(PAPERS_DIR, 'latest.txt'),
  DB_FILE: process.env.DB_FILE || path.join(ROOT, 'data', 'app.db'),
};
