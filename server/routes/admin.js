const express = require('express');
const contentStore = require('../content/contentStore');
const attemptsDb = require('../db/attempts');
const { publishPaper } = require('../content/parsePaper');
const { TEACHER_PIN, PAPERS_DIR, LATEST_FILE } = require('../config');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin');
}

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

router.get('/admin/dashboard', requireAdmin, (_req, res) => {
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

  res.render('admin/dashboard', { papers });
});

router.get('/admin/preview/:id', requireAdmin, (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper) return res.status(404).send('Paper not found.');
  res.render('admin/preview', { paper });
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

module.exports = router;
