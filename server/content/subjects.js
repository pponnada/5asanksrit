const fs = require('fs');
const path = require('path');
const { SUBJECTS_DIR, PAPERS_DIR, LATEST_FILE, DEFAULT_SUBJECT } = require('../config');

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// Student-facing labels. English unless a subject's subject.json "ui" block
// overrides them (Sanskrit shows Devanagari, with `hint` giving the small
// English gloss beneath it).
const UI_DEFAULTS = {
  text: {
    pageTitle: 'Practice',
    testTitle: 'Test',
    question: 'Question',
    correctAnswer: 'Correct answer',
    previous: '← Previous',
    next: 'Next →',
    submit: 'Submit',
    reviewTitle: 'Review',
    score: 'Score',
    home: 'Home',
    takeTest: 'Take Test',
    noTest: 'No test has been published yet.',
    otherTests: 'Other tests',
    done: 'Done',
    notDone: 'Not taken',
    flashcards: 'Flashcards',
  },
  hint: {},
};

function buildUi(cfgUi) {
  const ui = cfgUi || {};
  return { text: Object.assign({}, UI_DEFAULTS.text, ui.text), hint: Object.assign({}, UI_DEFAULTS.hint, ui.hint) };
}

/**
 * A "subject" is one folder under SUBJECTS_DIR:
 *
 *   subjects/<id>/subject.json       display names, prompt wording, options
 *   subjects/<id>/corpus.md          sections of source material / items
 *   subjects/<id>/genai-approved/    Teacher-approved generated items
 *
 * Re-read on every call (a few tiny files) so adding a subject folder or
 * editing its corpus needs no server restart, same as the corpus itself.
 */

function readSubject(id) {
  const dir = path.join(SUBJECTS_DIR, id);
  const configFile = path.join(dir, 'subject.json');
  const corpusFile = path.join(dir, 'corpus.md');
  if (!ID_RE.test(id) || !fs.existsSync(configFile) || !fs.existsSync(corpusFile)) return null;

  const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return {
    id,
    name: cfg.name || id,
    nameEn: cfg.nameEn || cfg.name || id,
    dir,
    corpusFile,
    genaiDir: path.join(dir, 'genai-approved'),
    // The default subject keeps the original papers/latest.txt pointer.
    latestFile: id === DEFAULT_SUBJECT ? LATEST_FILE : path.join(PAPERS_DIR, `latest-${id}.txt`),
    flashcards: !!cfg.flashcards,
    // Sections that only ever use their native corpus items (no generation).
    corpusOnlySections: Array.isArray(cfg.corpusOnlySections) ? cfg.corpusOnlySections : [],
    idPrefix: cfg.idPrefix || 'G',
    // Model replies contain LaTeX, so a lone backslash is literal, not a JSON escape.
    latex: !!cfg.latex,
    prompt: cfg.prompt || {},
    ui: buildUi(cfg.ui),
  };
}

/** Every subject, default subject first, then alphabetical. */
function listSubjects() {
  if (!fs.existsSync(SUBJECTS_DIR)) return [];
  return fs
    .readdirSync(SUBJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readSubject(d.name))
    .filter(Boolean)
    .sort((a, b) => (a.id === DEFAULT_SUBJECT ? -1 : b.id === DEFAULT_SUBJECT ? 1 : a.id.localeCompare(b.id)));
}

function getSubject(id) {
  return readSubject(id);
}

/** The subject whose Meanings-style vocabulary powers /flashcards, if any. */
function getFlashcardSubject() {
  return listSubjects().find((s) => s.flashcards) || null;
}

/** The UI labels for a paper's subject (English defaults if the subject is gone). */
function uiForPaper(paper) {
  const subject = getSubject(paper.subject);
  return subject ? subject.ui : buildUi(null);
}

module.exports = { listSubjects, getSubject, getFlashcardSubject, uiForPaper, DEFAULT_SUBJECT };
