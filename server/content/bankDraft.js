/**
 * In-memory state for growing a section's GenAI-approved pool on its own,
 * outside of building any specific paper (TEACHER_WORKFLOW.md "Manage
 * Question Bank"). Same single-Teacher, server-side-singleton simplicity
 * assumption as builderDraft.js — anything Teacher-approved is written
 * straight to genai-approved/*.json (genaiApprovedStore.js); only the
 * in-progress requested count / pasted reply / parsed candidates for a
 * section live here, per section number.
 */

let state = {};

function reset() {
  state = {};
}

function get(number) {
  return state[number] || null;
}

/** Starts (or restarts) a generation round for a section: how many new items the Teacher wants. */
function start(number, requestedCount) {
  state[number] = { requestedCount, raw: '', items: [], errors: [] };
}

function setPending(number, { raw, items, errors }) {
  const entry = state[number];
  if (!entry) return;
  entry.raw = raw;
  entry.items = items;
  entry.errors = errors;
}

function clear(number) {
  delete state[number];
}

module.exports = { reset, get, start, setPending, clear };
