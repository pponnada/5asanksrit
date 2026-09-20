const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');

// Content/DB locations can be overridden via env vars, pointing the app at
// an isolated temp directory — used by the test suite so it never touches
// the real corpus/papers/data in this repo.
const PAPERS_DIR = process.env.PAPERS_DIR || path.join(ROOT, 'papers');

module.exports = {
  ROOT,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  TEACHER_PIN: process.env.TEACHER_PIN || '1234',
  SESSION_SECRET: process.env.SESSION_SECRET || 'sanskrit-app-dev-secret-change-me',
  CORPUS_FILE: process.env.CORPUS_FILE || path.join(ROOT, 'qa-corpus.md'),
  GENAI_APPROVED_DIR: process.env.GENAI_APPROVED_DIR || path.join(ROOT, 'genai-approved'),
  PAPERS_DIR,
  LATEST_FILE: process.env.LATEST_FILE || path.join(PAPERS_DIR, 'latest.txt'),
  DB_FILE: process.env.DB_FILE || path.join(ROOT, 'data', 'app.db'),
};
