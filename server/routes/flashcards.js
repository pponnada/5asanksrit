const express = require('express');
const { loadFlashcardPool } = require('../content/flashcardPool');
const { shuffled } = require('../content/shuffle');
const flashcardsDb = require('../db/flashcards');

const router = express.Router();

function findItem(pool, id) {
  return pool.find((item) => item.id === id) || null;
}

function cardPayload(item) {
  const p = flashcardsDb.getProgress(item.id);
  return {
    id: item.id,
    stem: item.stem,
    options: shuffled(item.options),
    correctCount: p.correct_count,
    required: p.required,
  };
}

router.get('/flashcards', (_req, res) => {
  const pool = loadFlashcardPool();
  if (pool.length === 0) {
    return res.render('flashcards', { card: null, stats: null, poolEmpty: true });
  }

  const firstId = flashcardsDb.pickNext(pool, null);
  const card = firstId ? cardPayload(findItem(pool, firstId)) : null;
  res.render('flashcards', { card, stats: flashcardsDb.stats(pool), poolEmpty: false });
});

router.post('/flashcards/answer', express.json(), (req, res) => {
  const pool = loadFlashcardPool();
  const { questionId, selectedOption } = req.body || {};
  const item = questionId ? findItem(pool, questionId) : null;
  if (!item) return res.status(404).json({ ok: false, error: 'not_found' });

  const correct = selectedOption === item.answer;
  const progress = flashcardsDb.recordAnswer(item.id, correct);

  res.json({
    ok: true,
    correct,
    correctAnswer: item.answer,
    englishMeaning: item.englishMeaning,
    note: item.note,
    correctCount: progress.correct_count,
    required: progress.required,
    stats: flashcardsDb.stats(pool),
  });
});

router.get('/flashcards/next', (req, res) => {
  const pool = loadFlashcardPool();
  if (pool.length === 0) return res.status(404).json({ ok: false, error: 'empty_pool' });

  const nextId = flashcardsDb.pickNext(pool, req.query.exclude || null);
  const stats = flashcardsDb.stats(pool);
  if (!nextId) return res.json({ ok: true, done: true, card: null, stats });
  res.json({ ok: true, done: false, card: cardPayload(findItem(pool, nextId)), stats });
});

module.exports = router;
