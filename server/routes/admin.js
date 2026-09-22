const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const contentStore = require('../content/contentStore');
const attemptsDb = require('../db/attempts');
const backup = require('../db/backup');
const { publishPaper } = require('../content/parsePaper');
const requireAdmin = require('../middleware/requireAdmin');
const { TEACHER_PIN, PAPERS_DIR, LATEST_FILE } = require('../config');

const router = express.Router();

function scoreAttempt(paper, answers) {
  let correct = 0;
  for (const item of paper.items) {
    if (answers[item.id] && answers[item.id] === item.answer) correct++;
  }
  return correct;
}

function summarize(paper) {
  return paper.sections.length + ' sections · ' + paper.items.length + ' questions · ' + paper.timeLimitMinutes + ' min';
}

router.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { error: null });
});

router.post('/admin', express.urlencoded({ extended: false }), (req, res) => {
  if (req.body.pin === TEACHER_PIN) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: 'Wrong PIN.' });
});

router.get('/admin/dashboard', requireAdmin, (req, res) => {
  const latestId = contentStore.getLatestId();
  const papers = contentStore.listAllPapers().map((p) => {
    const attempt = attemptsDb.getByPaperId(p.id);
    const finalized = attempt && attempt.status !== 'in_progress';
    let score = null;
    if (finalized) {
      const answers = attemptsDb.getAnswersMap(attempt.id);
      score = scoreAttempt(p, answers) + '/' + p.items.length;
    }

    const isLatest = p.id === latestId;
    let badge;
    if (isLatest) badge = { type: 'latest', label: 'Latest' };
    else if (!p.publishedAt) badge = { type: 'draft', label: 'Draft' };
    else if (finalized) badge = { type: 'taken', label: 'Taken' };
    else badge = { type: 'not-taken', label: 'Not taken' };

    return {
      id: p.id,
      summary: summarize(p),
      badge,
      isLatest,
      taken: !!finalized,
      score,
    };
  });

  res.render('admin/dashboard', {
    papers,
    dbStats: backup.getStats(),
    restored: req.query.restored === '1',
    backupError: typeof req.query.error === 'string' ? req.query.error.slice(0, 200) : null,
  });
});

router.get('/admin/preview/:id', requireAdmin, (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper) return res.status(404).send('Paper not found.');
  const isLatest = paper.id === contentStore.getLatestId();
  res.render('admin/preview', { paper, isLatest });
});

router.get('/admin/results/:id', requireAdmin, (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper) return res.status(404).send('Paper not found.');

  const attempt = attemptsDb.getByPaperId(paper.id);
  if (!attempt || attempt.status === 'in_progress') {
    return res.status(404).send('This paper has not been completed yet.');
  }

  const answers = attemptsDb.getAnswersMap(attempt.id);
  const score = scoreAttempt(paper, answers);
  const timeTakenMinutes = Math.round((attempt.submit_ts - attempt.start_ts) / 60000);

  res.render('admin/results', {
    paper,
    answers,
    score,
    total: paper.items.length,
    status: attempt.status === 'auto_submitted' ? 'Auto-submitted (time up)' : 'Submitted',
    timeTakenMinutes,
  });
});

router.post('/admin/make-latest/:id', requireAdmin, (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper) return res.status(404).send('Paper not found.');

  // Equivalent to TEACHER_WORKFLOW.md's publish step: stamps Published-At
  // if this paper has never been published before, then points latest.txt
  // at it. A Draft can be promoted straight from here as a fallback.
  publishPaper(PAPERS_DIR, LATEST_FILE, paper.id);
  res.redirect('/admin/dashboard');
});

// ---------- Database backup & restore ----------

function formatDbSize(bytes) {
  if (bytes == null) return 'unknown size';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Download a consistent snapshot of the sqlite database. Uses VACUUM INTO
// so the download is a clean single file even while the app is running.
router.get('/admin/backup', requireAdmin, (_req, res) => {
  let tmpPath = null;
  try {
    tmpPath = backup.createBackupFile();
  } catch (err) {
    return res.status(500).send('Could not create backup: ' + err.message);
  }
  res.download(tmpPath, backup.backupFilename(), (err) => {
    fs.rm(tmpPath, { force: true }, () => {});
    if (err && !res.headersSent) res.status(500).send('Could not send backup.');
  });
});

// Restore replaces ALL current attempts/answers/flashcard progress with the
// uploaded backup's contents. The client POSTs the raw .db bytes
// (Content-Type: application/octet-stream) — plain fetch, no multipart
// parsing dependency needed.
router.post(
  '/admin/restore',
  requireAdmin,
  express.raw({ type: 'application/octet-stream', limit: '100mb' }),
  (req, res) => {
    const body = req.body;
    if (!body || !(body instanceof Buffer) || body.length === 0) {
      return res.status(400).json({ ok: false, error: 'No backup file received.' });
    }
    if (body.length > backup.MAX_RESTORE_BYTES) {
      return res.status(400).json({ ok: false, error: 'Backup file is too large (max 100 MB).' });
    }

    const tmpPath = path.join(os.tmpdir(), `sanskrit-restore-${Date.now()}-${process.pid}.db`);
    try {
      fs.writeFileSync(tmpPath, body);
      const stats = backup.restoreFromBackupFile(tmpPath);
      return res.json({ ok: true, stats });
    } catch (err) {
      return res.status(err.status || 400).json({ ok: false, error: err.message });
    } finally {
      fs.rm(tmpPath, { force: true }, () => {});
    }
  }
);

router.get('/admin/backup-info', requireAdmin, (_req, res) => {
  const stats = backup.getStats();
  res.json({ ok: true, stats, sizeLabel: formatDbSize(stats.dbSizeBytes) });
});

module.exports = router;
