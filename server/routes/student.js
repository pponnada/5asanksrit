const express = require('express');
const contentStore = require('../content/contentStore');
const attemptsDb = require('../db/attempts');

const router = express.Router();

function scoreAttempt(paper, answers) {
  let correct = 0;
  for (const item of paper.items) {
    if (answers[item.id] && answers[item.id] === item.answer) correct++;
  }
  return correct;
}

function resolveStartQuestionNumber(paper, answers) {
  for (let i = 0; i < paper.items.length; i++) {
    if (!answers[paper.items[i].id]) return i + 1;
  }
  return paper.items.length; // all answered — land on the last one
}

router.get('/', (_req, res) => {
  const latestId = contentStore.getLatestId();
  const latestPaper = latestId ? contentStore.getPaper(latestId) : null;

  const otherPapers = contentStore
    .listPublishedPapers()
    .filter((p) => p.id !== latestId)
    .map((p) => {
      const attempt = attemptsDb.getByPaperId(p.id);
      const finalized = attempt && attempt.status !== 'in_progress';
      let score = null;
      if (finalized) {
        const answers = attemptsDb.getAnswersMap(attempt.id);
        score = scoreAttempt(p, answers) + '/' + p.items.length;
      }
      return { id: p.id, taken: !!finalized, score };
    });

  res.render('landing', { latestPaper, otherPapers });
});

router.get('/test/:id', (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper || !paper.publishedAt) return res.status(404).send('Paper not found.');

  let attempt = attemptsDb.getOrCreateAttempt(paper.id, paper.timeLimitMinutes);
  attempt = attemptsDb.enforceExpiry(attempt);

  if (attempt.status !== 'in_progress') {
    return res.redirect('/test/' + paper.id + '/review');
  }

  const answers = attemptsDb.getAnswersMap(attempt.id);
  const n = resolveStartQuestionNumber(paper, answers);
  res.redirect('/test/' + paper.id + '/question/' + n);
});

router.get('/test/:id/question/:n', (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper || !paper.publishedAt) return res.status(404).send('Paper not found.');

  let attempt = attemptsDb.getByPaperId(paper.id);
  if (!attempt) return res.redirect('/test/' + paper.id);
  attempt = attemptsDb.enforceExpiry(attempt);

  if (attempt.status !== 'in_progress') {
    return res.redirect('/test/' + paper.id + '/review');
  }

  const n = parseInt(req.params.n, 10);
  if (!n || n < 1 || n > paper.items.length) return res.status(404).send('No such question.');

  const answers = attemptsDb.getAnswersMap(attempt.id);
  const item = paper.items[n - 1];

  res.render('test', {
    paperId: paper.id,
    item,
    questionNumber: n,
    totalQuestions: paper.items.length,
    selectedOption: answers[item.id] || null,
    endsAt: new Date(attemptsDb.endTs(attempt)).toISOString(),
    totalSeconds: paper.timeLimitMinutes * 60,
  });
});

router.post('/test/:id/answer', express.json(), (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper) return res.status(404).json({ ok: false, error: 'not_found' });

  let attempt = attemptsDb.getByPaperId(paper.id);
  if (!attempt) return res.status(404).json({ ok: false, error: 'no_attempt' });
  attempt = attemptsDb.enforceExpiry(attempt);

  if (attempt.status !== 'in_progress') {
    return res.status(409).json({ ok: false, error: 'attempt_finalized' });
  }

  const { questionId, selectedOption } = req.body || {};
  if (!questionId || !selectedOption) {
    return res.status(400).json({ ok: false, error: 'bad_request' });
  }

  attemptsDb.upsertAnswer(attempt.id, questionId, selectedOption);
  res.json({ ok: true });
});

router.post('/test/:id/submit', (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper) return res.status(404).send('Paper not found.');

  let attempt = attemptsDb.getByPaperId(paper.id);
  if (!attempt) return res.redirect('/test/' + paper.id);
  attempt = attemptsDb.enforceExpiry(attempt);

  if (attempt.status === 'in_progress') {
    attemptsDb.submitAttempt(attempt.id);
  }

  res.redirect('/test/' + paper.id + '/review');
});

router.get('/test/:id/review', (req, res) => {
  const paper = contentStore.getPaper(req.params.id);
  if (!paper) return res.status(404).send('Paper not found.');

  let attempt = attemptsDb.getByPaperId(paper.id);
  if (!attempt) return res.redirect('/test/' + paper.id);
  attempt = attemptsDb.enforceExpiry(attempt);

  if (attempt.status === 'in_progress') {
    return res.redirect('/test/' + paper.id);
  }

  const answers = attemptsDb.getAnswersMap(attempt.id);
  const score = scoreAttempt(paper, answers);

  res.render('review', {
    items: paper.items,
    answers,
    score,
    total: paper.items.length,
  });
});

module.exports = router;
