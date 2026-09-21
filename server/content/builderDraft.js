/**
 * In-memory state for the in-progress paper build (TEACHER_WORKFLOW.md §5,
 * plan's "Architecture decisions"). A server-side singleton, not a DB table
 * or cookie payload: this app assumes a single fixed Teacher building one
 * paper at a time, same simplicity assumption as everywhere else
 * (REQUIREMENTS.md §13). Anything already Teacher-approved is durably
 * written to genai-approved/*.json immediately (genaiApprovedStore.js) —
 * only the in-progress selections/splits/pending-candidates live here, so
 * a lost server process only costs cheap-to-redo picks, never approved work.
 */

let draft = null;

function reset() {
  draft = { sections: {}, timeLimitMinutes: null, pending: {} };
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
    const prev = d.sections[number] || {};
    d.sections[number] = {
      number,
      count,
      existing: prev.existing || 0,
      newCount: prev.newCount || 0,
      approvedItems: prev.approvedItems || [],
    };
  });
}

function setSplit(number, existing, newCount) {
  const entry = getDraft().sections[number];
  if (!entry) return;
  entry.existing = existing;
  entry.newCount = newCount;
}

function setPending(number, result) {
  getDraft().pending[number] = result;
}

function getPending(number) {
  return getDraft().pending[number] || null;
}

function clearPending(number) {
  delete getDraft().pending[number];
}

function recordApproved(number, items) {
  const entry = getDraft().sections[number];
  if (!entry) return;
  entry.approvedItems = entry.approvedItems.concat(items);
  clearPending(number);
}

function isResolved(number) {
  const entry = getDraft().sections[number];
  if (!entry) return true;
  return (entry.approvedItems || []).length >= (entry.newCount || 0);
}

function isFullyResolved() {
  const d = getDraft();
  return Object.keys(d.sections).every((n) => isResolved(Number(n)));
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
  setSplit,
  setPending,
  getPending,
  clearPending,
  recordApproved,
  isResolved,
  isFullyResolved,
  setTimeLimit,
  sectionsList,
};
