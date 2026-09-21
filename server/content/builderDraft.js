/**
 * In-memory state for the in-progress paper build. A server-side
 * singleton, not a DB table or cookie payload: this app assumes a single
 * fixed Teacher building one paper at a time, same simplicity assumption
 * as everywhere else (REQUIREMENTS.md §13).
 *
 * Growing a section's question bank (native corpus + GenAI-approved pool)
 * is a separate, standalone flow (server/content/bankDraft.js,
 * server/routes/questionBank.js) — by the time a Teacher is here, each
 * selected section's count is just a draw size against whatever is already
 * banked, so this only needs to track sections + counts + the time limit.
 */

let draft = null;

function reset() {
  draft = { sections: {}, timeLimitMinutes: null };
  return draft;
}

function getDraft() {
  if (!draft) reset();
  return draft;
}

/** list: [{ number, count }] — the Teacher's section+count selections. */
function setSections(list) {
  const d = getDraft();
  const numbers = new Set(list.map((s) => s.number));

  Object.keys(d.sections).forEach((n) => {
    if (!numbers.has(Number(n))) delete d.sections[n];
  });

  list.forEach(({ number, count }) => {
    d.sections[number] = { number, count };
  });
}

function setTimeLimit(minutes) {
  getDraft().timeLimitMinutes = minutes;
}

function sectionsList() {
  return Object.values(getDraft().sections).sort((a, b) => a.number - b.number);
}

module.exports = {
  reset,
  getDraft,
  setSections,
  setTimeLimit,
  sectionsList,
};
