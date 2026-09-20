const db = require('./db');

const BOX_COUNT = 5;

// Leitner boxes: a correct answer promotes a card to the next box (a longer
// wait before it's due again); a wrong answer drops it straight back to box
// 1, due immediately, so it resurfaces in this same session instead of
// waiting for the next one.
const BOX_DELAY_MS = {
  1: 0,
  2: 10 * 60 * 1000, // 10 minutes
  3: 60 * 60 * 1000, // 1 hour
  4: 24 * 60 * 60 * 1000, // 1 day
  5: 4 * 24 * 60 * 60 * 1000, // 4 days
};

const getStmt = db.prepare('SELECT * FROM flashcard_progress WHERE question_id = ?');
const allStmt = db.prepare('SELECT * FROM flashcard_progress');
const upsertStmt = db.prepare(`
  INSERT INTO flashcard_progress
    (question_id, box, due_ts, correct_count, incorrect_count, last_result, last_seen_ts)
  VALUES
    (@question_id, @box, @due_ts, @correct_count, @incorrect_count, @last_result, @last_seen_ts)
  ON CONFLICT(question_id) DO UPDATE SET
    box = excluded.box,
    due_ts = excluded.due_ts,
    correct_count = excluded.correct_count,
    incorrect_count = excluded.incorrect_count,
    last_result = excluded.last_result,
    last_seen_ts = excluded.last_seen_ts
`);

function defaultProgress(questionId) {
  return {
    question_id: questionId,
    box: 1,
    due_ts: 0,
    correct_count: 0,
    incorrect_count: 0,
    last_result: null,
    last_seen_ts: null,
  };
}

function getProgress(questionId) {
  return getStmt.get(questionId) || defaultProgress(questionId);
}

function getProgressMap() {
  const map = {};
  for (const row of allStmt.all()) map[row.question_id] = row;
  return map;
}

function recordAnswer(questionId, correct) {
  const current = getProgress(questionId);
  const box = correct ? Math.min(current.box + 1, BOX_COUNT) : 1;
  const now = Date.now();

  upsertStmt.run({
    question_id: questionId,
    box,
    due_ts: correct ? now + BOX_DELAY_MS[box] : now,
    correct_count: current.correct_count + (correct ? 1 : 0),
    incorrect_count: current.incorrect_count + (correct ? 0 : 1),
    last_result: correct ? 'correct' : 'incorrect',
    last_seen_ts: now,
  });

  return getProgress(questionId);
}

/**
 * Picks the next card to show from `pool` (array of items with an `id`),
 * preferring whichever is most due for review — least-mastered box first,
 * then earliest due time — and never repeating `excludeId` back-to-back
 * unless it's the only card in the pool.
 */
function pickNext(pool, excludeId) {
  if (pool.length === 0) return null;
  const progressMap = getProgressMap();
  const now = Date.now();

  const candidates = pool
    .map((item) => progressMap[item.id] || defaultProgress(item.id))
    .filter((p) => pool.length === 1 || p.question_id !== excludeId);

  candidates.sort((a, b) => {
    const aDue = a.due_ts <= now ? 0 : 1;
    const bDue = b.due_ts <= now ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue; // due cards before not-yet-due ones
    if (a.box !== b.box) return a.box - b.box; // least-mastered first
    return a.due_ts - b.due_ts; // then soonest-due
  });

  return candidates[0].question_id;
}

function stats(pool) {
  const progressMap = getProgressMap();
  const now = Date.now();
  let fresh = 0;
  let learning = 0;
  let mastered = 0;
  let due = 0;

  for (const item of pool) {
    const row = progressMap[item.id];
    if (!row) fresh++;
    else if (row.box >= BOX_COUNT) mastered++;
    else learning++;

    if (!row || row.due_ts <= now) due++;
  }

  return { total: pool.length, fresh, learning, mastered, due };
}

module.exports = { getProgress, recordAnswer, pickNext, stats, BOX_COUNT };
