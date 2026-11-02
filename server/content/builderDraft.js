/**
 * In-memory state for the in-progress paper build, one draft per subject. A
 * server-side singleton, not a DB table or cookie payload: this app assumes
 * a single fixed Teacher building one paper at a time, same simplicity
 * assumption as everywhere else (REQUIREMENTS.md §13).
 *
 * Growing a section's question bank (native corpus + GenAI-approved pool)
 * is a separate, standalone flow (server/content/bankDraft.js,
 * server/routes/questionBank.js) — by the time a Teacher is here, each
 * selected section's count is just a draw size against whatever is already
 * banked, so this only needs to track sections + counts + the time limit.
 */

const drafts = {};

function reset(subjectId) {
  drafts[subjectId] = { sections: {}, timeLimitMinutes: null };
  return drafts[subjectId];
}

function getDraft(subjectId) {
  return drafts[subjectId] || reset(subjectId);
}

/** list: [{ number, count }] — the Teacher's section+count selections. */
function setSections(subjectId, list) {
  const d = getDraft(subjectId);
  const numbers = new Set(list.map((s) => s.number));

  Object.keys(d.sections).forEach((n) => {
    if (!numbers.has(Number(n))) delete d.sections[n];
  });

  list.forEach(({ number, count }) => {
    d.sections[number] = { number, count };
  });
}

function setTimeLimit(subjectId, minutes) {
  getDraft(subjectId).timeLimitMinutes = minutes;
}

function sectionsList(subjectId) {
  return Object.values(getDraft(subjectId).sections).sort((a, b) => a.number - b.number);
}

module.exports = {
  reset,
  getDraft,
  setSections,
  setTimeLimit,
  sectionsList,
};
