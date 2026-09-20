const db = require('./db');

const insertAttempt = db.prepare(
  `INSERT INTO attempts (paper_id, start_ts, duration_minutes, status)
   VALUES (?, ?, ?, 'in_progress')`
);
const getByPaperId = db.prepare(`SELECT * FROM attempts WHERE paper_id = ?`);
const getById = db.prepare(`SELECT * FROM attempts WHERE id = ?`);
const finalize = db.prepare(
  `UPDATE attempts SET status = ?, submit_ts = ? WHERE id = ?`
);
const upsertAnswerStmt = db.prepare(`
  INSERT INTO answers (attempt_id, question_id, selected_option, answered_ts)
  VALUES (@attempt_id, @question_id, @selected_option, @answered_ts)
  ON CONFLICT(attempt_id, question_id) DO UPDATE SET
    selected_option = excluded.selected_option,
    answered_ts = excluded.answered_ts
`);
const getAnswersStmt = db.prepare(`SELECT * FROM answers WHERE attempt_id = ?`);

function getOrCreateAttempt(paperId, durationMinutes) {
  let attempt = getByPaperId.get(paperId);
  if (!attempt) {
    const result = insertAttempt.run(paperId, Date.now(), durationMinutes);
    attempt = getById.get(result.lastInsertRowid);
  }
  return attempt;
}

function isExpired(attempt) {
  const endTs = attempt.start_ts + attempt.duration_minutes * 60 * 1000;
  return Date.now() >= endTs;
}

function endTs(attempt) {
  return attempt.start_ts + attempt.duration_minutes * 60 * 1000;
}

/**
 * The server-side expiry backstop (REQUIREMENTS.md §8.5/§8.8): call this
 * before acting on any attempt. If time is up and it's still in_progress,
 * finalize it as auto_submitted using whatever answers were already saved.
 * Returns the (possibly updated) attempt row.
 */
function enforceExpiry(attempt) {
  if (attempt.status === 'in_progress' && isExpired(attempt)) {
    finalize.run('auto_submitted', endTs(attempt), attempt.id);
    return getById.get(attempt.id);
  }
  return attempt;
}

function submitAttempt(attemptId) {
  finalize.run('submitted', Date.now(), attemptId);
  return getById.get(attemptId);
}

function upsertAnswer(attemptId, questionId, selectedOption) {
  upsertAnswerStmt.run({
    attempt_id: attemptId,
    question_id: questionId,
    selected_option: selectedOption,
    answered_ts: Date.now(),
  });
}

function getAnswersMap(attemptId) {
  const rows = getAnswersStmt.all(attemptId);
  const map = {};
  for (const row of rows) map[row.question_id] = row.selected_option;
  return map;
}

module.exports = {
  getOrCreateAttempt,
  getByPaperId: (paperId) => getByPaperId.get(paperId),
  getById: (id) => getById.get(id),
  isExpired,
  endTs,
  enforceExpiry,
  submitAttempt,
  upsertAnswer,
  getAnswersMap,
};
