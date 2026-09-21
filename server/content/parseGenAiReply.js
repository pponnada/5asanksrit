/**
 * Parses whatever the Teacher pasted back from a web chat LLM into
 * candidate question items (TEACHER_WORKFLOW.md §7). The reply was
 * hand-copied out of an arbitrary chat UI, so this tolerates the common
 * ways that goes wrong (code fences, stray prose around the array) but is
 * strict about the shape of each item, since a bad item must never reach
 * the Student silently.
 */

function stripCodeFences(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1] : text;
}

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

/**
 * Validates one candidate item (already parsed as a plain object — either
 * out of the LLM's JSON array, or resubmitted from the Teacher's edit
 * form). Returns { item } on success or { error } naming what's wrong.
 */
function validateItem(raw, { expectedOptionCount = null } = {}) {
  if (!raw || typeof raw !== 'object') {
    return { error: 'not an object' };
  }

  const stem = typeof raw.stem === 'string' ? raw.stem.trim() : '';
  if (!stem) return { error: 'missing or empty "stem"' };

  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
    : [];
  if (options.length < 2) return { error: 'needs at least 2 non-empty "options"' };
  if (new Set(options).size !== options.length) return { error: '"options" contains duplicates' };
  if (expectedOptionCount != null && options.length !== expectedOptionCount) {
    return { error: `expected ${expectedOptionCount} options, got ${options.length}` };
  }

  const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
  if (!answer || !options.includes(answer)) {
    return { error: '"answer" must exactly match one of the "options"' };
  }

  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null;

  return { item: { stem, options, answer, note } };
}

/**
 * @returns {{ items: object[], errors: string[] }} — successfully-validated
 *   candidates, plus a human-readable error per problem (a bad item is
 *   dropped from `items`, not silently coerced into something valid; a
 *   count mismatch is reported, not padded/truncated).
 */
function parseGenAiReply(rawText, { expectedCount = null, expectedOptionCount = null } = {}) {
  let text = (rawText || '').trim();
  if (!text) return { items: [], errors: ['Nothing was pasted.'] };

  text = stripCodeFences(text).trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const extracted = extractJsonArray(text);
    if (!extracted) {
      return { items: [], errors: ['Could not find a JSON array in the pasted text.'] };
    }
    try {
      parsed = JSON.parse(extracted);
    } catch (e2) {
      return { items: [], errors: ['The pasted text is not valid JSON: ' + e2.message] };
    }
  }

  if (!Array.isArray(parsed)) {
    return { items: [], errors: ['Expected a JSON array at the top level.'] };
  }

  const errors = [];
  if (expectedCount != null && parsed.length !== expectedCount) {
    errors.push(`Asked for ${expectedCount} items, got ${parsed.length}.`);
  }

  const items = [];
  parsed.forEach((raw, i) => {
    const { item, error } = validateItem(raw, { expectedOptionCount });
    if (error) {
      errors.push(`Item ${i + 1}: ${error}.`);
    } else {
      items.push(item);
    }
  });

  return { items, errors };
}

module.exports = { parseGenAiReply, validateItem };
