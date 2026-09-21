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

/**
 * A content-neutral worked example — placeholders only, never real Sanskrit
 * — so it can only ever demonstrate the JSON shape and can never contradict
 * a section's actual style the way a fixed hardcoded example would (it
 * used to be a literal fill-in-the-blank verb example lifted from
 * TEACHER_WORKFLOW.md, shown unchanged for every section regardless of
 * that section's own style — wrong for e.g. a letter-decomposition section).
 */
function shapeExample(optionCount) {
  const options = [];
  for (let i = 1; i <= optionCount; i++) options.push(`<option ${i}>`);
  const optionsJson = options.map((o) => `"${o}"`).join(', ');
  return `{"stem": "<question stem in Devanagari>", "options": [${optionsJson}], "answer": "<copied exactly from one of the options above>", "note": "<short explanation, optional>"}`;
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

If the existing items below fall into more than one distinct sub-pattern (for example, different pronoun pairs, different grammatical persons, or different named word/option sets — sometimes marked with a heading in the source), spread your new questions across all of those sub-patterns in similar proportion to how they appear below. Do not generate every new item in only one sub-pattern.

Existing items in this section (style reference only):

${nativeContext}${genaiContext}

Write exactly ${newCount} NEW multiple-choice questions for this section. Each must have ${optionCount} options: one correct answer plus ${optionCount - 1} plausible-but-wrong distractors of the same kind used in the examples above (e.g. other words from the same category, other grammatical forms of the same root — not random unrelated words).

Reply with ONLY a JSON array — no explanation before or after it, no markdown code fences, just the raw JSON. Each element must look exactly like this:

{"stem": "...", "options": ["...", "...", "...", "..."], "answer": "...", "note": "..."}

- "stem" — the question text.
- "options" — exactly ${optionCount} distinct, non-empty strings.
- "answer" — copied character-for-character from one of the "options".
- "note" — a short explanation of why that answer is correct (optional but preferred).

Shape of one element (placeholders only — for actual content, style, and vocabulary, follow the existing items above, not this):
${shapeExample(optionCount)}`;
}

module.exports = { buildPrompt, inferOptionCount };
