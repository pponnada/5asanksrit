/**
 * In-memory state for growing a section's GenAI-approved pool on its own,
 * outside of building any specific paper (TEACHER_WORKFLOW.md "Manage
 * Question Bank"). Same single-Teacher, server-side-singleton simplicity
 * assumption as builderDraft.js — anything Teacher-approved is written
 * straight to <subject>/genai-approved/*.json (genaiApprovedStore.js); only
 * the in-progress requested count / pasted reply / parsed candidates for a
 * section live here, per subject and section number.
 */

let state = {};

function key(subjectId, number) {
  return subjectId + ':' + number;
}

function reset() {
  state = {};
}

function get(subjectId, number) {
  return state[key(subjectId, number)] || null;
}

/** Starts (or restarts) a generation round for a section: how many new items the Teacher wants. */
function start(subjectId, number, requestedCount) {
  state[key(subjectId, number)] = { requestedCount, raw: '', items: [], errors: [] };
}

function setPending(subjectId, number, { raw, items, errors }) {
  const entry = state[key(subjectId, number)];
  if (!entry) return;
  entry.raw = raw;
  entry.items = items;
  entry.errors = errors;
}

function clear(subjectId, number) {
  delete state[key(subjectId, number)];
}

module.exports = { reset, get, start, setPending, clear };
