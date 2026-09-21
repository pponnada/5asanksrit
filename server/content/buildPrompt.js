const { getSection } = require('./sectionSummary');
const { loadSectionPool } = require('./genaiApprovedStore');
const { GENAI_APPROVED_DIR } = require('../config');

/**
 * The MCQ option count to ask the LLM for, inferred from this section's own
 * items (native-with-options, falling back to its GenAI-approved pool),
 * defaulting to 4 — every section in qa-corpus.md today uses 4
 * (TEACHER_WORKFLOW.md §7).
 */
function inferOptionCount(sectionNumber) {
  const section = getSection(sectionNumber);
  const genaiItems = loadSectionPool(sectionNumber, GENAI_APPROVED_DIR);
  const nativeWithOptions = section ? section.items.filter((i) => i.hasOptions) : [];
  const sample = nativeWithOptions[0] || genaiItems[0];
  return sample ? sample.options.length : 4;
}

function formatContextItem(item) {
  let line = `- स्तेम: ${item.stem}`;
  if (item.hasOptions || item.options) line += `\n  विकल्पाः: ${item.options.join(', ')}`;
  line += `\n  उत्तरम्: ${item.answer}`;
  if (item.note) line += `\n  Note: ${item.note}`;
  return line;
}

/**
 * The full copy-paste prompt for one section (TEACHER_WORKFLOW.md §6/§7):
 * section identity, audience/MCQ constraints, every existing native +
 * GenAI-approved item as style context, the exact count still needed, and
 * an explicit JSON output-format spec with a worked example.
 */
function buildPrompt(sectionNumber, newCount) {
  const section = getSection(sectionNumber);
  if (!section) throw new Error(`Unknown section ${sectionNumber}`);

  const genaiItems = loadSectionPool(sectionNumber, GENAI_APPROVED_DIR);
  const optionCount = inferOptionCount(sectionNumber);

  const nativeContext = section.items.length
    ? section.items.map(formatContextItem).join('\n\n')
    : '(no existing items in this section yet)';

  const genaiContext = genaiItems.length
    ? '\n\nAdditional previously-approved GenAI items in this exact multiple-choice shape:\n\n' +
      genaiItems.map(formatContextItem).join('\n\n')
    : '';

  return `You are helping a parent build a Sanskrit practice test for their child (roughly 5th-grade level, learning Sanskrit as a second language).

Section: विभागः ${section.number} — ${section.title}

Every question must be multiple choice — the child selects an option by tapping, never types Sanskrit. Match the vocabulary, grammar forms, phrasing style, and difficulty of the existing items below exactly. Do not introduce vocabulary or grammar patterns that aren't already present in this section, and do not repeat any of the stems shown below.

Existing items in this section (style reference only):

${nativeContext}${genaiContext}

Write exactly ${newCount} NEW multiple-choice questions for this section. Each must have ${optionCount} options: one correct answer plus ${optionCount - 1} plausible-but-wrong distractors of the same kind used in the examples above (e.g. other words from the same category, other grammatical forms of the same root — not random unrelated words).

Reply with ONLY a JSON array — no explanation before or after it, no markdown code fences, just the raw JSON. Each element must look exactly like this:

{"stem": "...", "options": ["...", "...", "...", "..."], "answer": "...", "note": "..."}

- "stem" — the question text.
- "options" — exactly ${optionCount} distinct, non-empty strings.
- "answer" — copied character-for-character from one of the "options".
- "note" — a short explanation of why that answer is correct (optional but preferred).

Worked example of one valid element:
{"stem": "त्वम् ______________ । (हस्)", "options": ["हससि", "वदामः", "कूर्दामि", "चलथ"], "answer": "हससि", "note": "मध्यमपुरुष-एकवचनस्य रूपम्।"}`;
}

module.exports = { buildPrompt, inferOptionCount };
