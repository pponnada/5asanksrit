const express = require('express');
const { loadFlashcardPool } = require('../content/flashcardPool');
const flashcardsDb = require('../db/flashcards');

const router = express.Router();

function findItem(pool, id) {
  return pool.find((item) => item.id === id) || null;
}

function cardPayload(item) {
  return { id: item.id, stem: item.stem, options: item.options };
}

router.get('/flashcards', (_req, res) => {
  const pool = loadFlashcardPool();
  if (pool.length === 0) {
    return res.render('flashcards', { card: null, stats: null });
  }

  const firstId = flashcardsDb.pickNext(pool, null);
  const item = findItem(pool, firstId);
  res.render('flashcards', { card: cardPayload(item), stats: flashcardsDb.stats(pool) });
});

router.post('/flashcards/answer', express.json(), (req, res) => {
  const pool = loadFlashcardPool();
  const { questionId, selectedOption } = req.body || {};
  const item = questionId ? findItem(pool, questionId) : null;
  if (!item) return res.status(404).json({ ok: false, error: 'not_found' });

  const correct = selectedOption === item.answer;
  flashcardsDb.recordAnswer(item.id, correct);

  res.json({
    ok: true,
    correct,
    correctAnswer: item.answer,
    englishMeaning: item.englishMeaning,
    note: item.note,
    stats: flashcardsDb.stats(pool),
  });
});

router.get('/flashcards/next', (req, res) => {
  const pool = loadFlashcardPool();
  if (pool.length === 0) return res.status(404).json({ ok: false, error: 'empty_pool' });

  const nextId = flashcardsDb.pickNext(pool, req.query.exclude || null);
  const item = findItem(pool, nextId);
  res.json({ ok: true, card: cardPayload(item), stats: flashcardsDb.stats(pool) });
});

module.exports = router;
