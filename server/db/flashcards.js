const db = require('./db');

// Drill rules: every card must be answered correctly REQUIRED_DEFAULT times.
// Any wrong answer resets that card's correct count to 0 and raises its
// requirement to REQUIRED_AFTER_MISS. Cards are drawn at random from those
// not yet finished, never the same card twice in a row.
const REQUIRED_DEFAULT = 3;
const REQUIRED_AFTER_MISS = 5;

const getStmt = db.prepare('SELECT * FROM flashcard_drill WHERE question_id = ?');
const allStmt = db.prepare('SELECT * FROM flashcard_drill');
const resetStmt = db.prepare('DELETE FROM flashcard_drill');
const upsertStmt = db.prepare(`
  INSERT INTO flashcard_drill (question_id, correct_count, required, wrong_count, last_seen_ts)
  VALUES (@question_id, @correct_count, @required, @wrong_count, @last_seen_ts)
  ON CONFLICT(question_id) DO UPDATE SET
    correct_count = excluded.correct_count,
    required = excluded.required,
    wrong_count = excluded.wrong_count,
    last_seen_ts = excluded.last_seen_ts
`);

function defaultProgress(questionId) {
  return {
    question_id: questionId,
    correct_count: 0,
    required: REQUIRED_DEFAULT,
    wrong_count: 0,
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

function isDone(p) {
  return p.correct_count >= p.required;
}

function recordAnswer(questionId, correct) {
  const current = getProgress(questionId);
  upsertStmt.run({
    question_id: questionId,
    correct_count: correct ? current.correct_count + 1 : 0,
    required: correct ? current.required : REQUIRED_AFTER_MISS,
    wrong_count: current.wrong_count + (correct ? 0 : 1),
    last_seen_ts: Date.now(),
  });
  return getProgress(questionId);
}

function resetAll() {
  resetStmt.run();
}

/**
 * Picks a random unfinished card from `pool` (items with an `id`), avoiding
 * `excludeId` unless it is the only unfinished card left. Returns null when
 * every card is finished.
 */
function pickNext(pool, excludeId) {
  const progressMap = getProgressMap();
  const open = pool
    .map((item) => progressMap[item.id] || defaultProgress(item.id))
    .filter((p) => !isDone(p))
    .map((p) => p.question_id);
  if (open.length === 0) return null;

  const choices = open.length > 1 ? open.filter((id) => id !== excludeId) : open;
  return choices[Math.floor(Math.random() * choices.length)];
}

function stats(pool) {
  const progressMap = getProgressMap();
  let mastered = 0;
  let attempted = 0;
  for (const item of pool) {
    const row = progressMap[item.id];
    if (row) attempted++;
    if (row && isDone(row)) mastered++;
  }
  return { total: pool.length, attempted, mastered, remaining: pool.length - mastered };
}

module.exports = {
  getProgress,
  recordAnswer,
  resetAll,
  pickNext,
  stats,
  REQUIRED_DEFAULT,
  REQUIRED_AFTER_MISS,
};
