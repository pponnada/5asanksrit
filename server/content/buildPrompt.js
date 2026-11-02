const { getSection } = require('./sectionSummary');
const { loadSectionPool } = require('./genaiApprovedStore');

// Wording that used to be hard-coded for Sanskrit; each subject's
// subject.json "prompt" block overrides any of these (subjects/<id>/).
const PROMPT_DEFAULTS = {
  intro: 'You are helping a parent build a practice test for their child (roughly 5th-grade level).',
  matchRule:
    "Match the vocabulary, phrasing style, and difficulty of the existing items below exactly, and do not repeat any of the stems shown below.",
  subPatternExamples: 'different question types or difficulty levels',
  distractorHint: 'plausible mistakes a student could make — not random unrelated answers',
  sourceIntro:
    'Source material for this section, supplied by the Teacher (poems, word banks, or similar) — this is the ONLY material your new items may draw on:',
  grounding:
    " Every new item's stem and correct answer must be built strictly from the source material above — e.g. if it's a poem, the answer must be an actual line or phrase copied from that poem, not one you invent; if it's a word bank, the answer must be one of the given words. Never introduce a line, phrase, or word that isn't already present in the source material. Prefer parts of the source material not already covered by the existing items below, so new items don't duplicate them.",
  extra: '',
  stemPlaceholder: '<question stem>',
  labels: { stem: 'Question', options: 'Options', answer: 'Answer' },
};

// Added automatically for subjects with "latex": true (parseGenAiReply.js
// repairs lone backslashes as a safety net, but asking for them doubled is
// what makes the reply valid JSON in the first place).
const LATEX_RULES =
  'Write ALL mathematics in LaTeX between single dollar signs, e.g. $\\frac{2}{3}$ or $2\\frac{1}{4} \\times 3$. Inside the JSON, every backslash must be doubled (write "$\\\\frac{2}{3}$" to produce $\\frac{2}{3}$). Every question, option and note must be a single line with no line breaks.';

function promptConfig(subject) {
  const cfg = subject.prompt || {};
  return Object.assign({}, PROMPT_DEFAULTS, cfg, { labels: Object.assign({}, PROMPT_DEFAULTS.labels, cfg.labels) });
}

/**
 * The MCQ option count to ask the LLM for, inferred from this section's own
 * items (native-with-options, falling back to its GenAI-approved pool),
 * defaulting to 4 — every section in qa-corpus.md today uses 4
 * (TEACHER_WORKFLOW.md §7).
 */
function inferOptionCount(subject, sectionNumber) {
  const section = getSection(subject, sectionNumber);
  const genaiItems = loadSectionPool(sectionNumber, subject.genaiDir);
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
function shapeExample(optionCount, stemPlaceholder) {
  const options = [];
  for (let i = 1; i <= optionCount; i++) options.push(`<option ${i}>`);
  const optionsJson = options.map((o) => `"${o}"`).join(', ');
  return `{"stem": "${stemPlaceholder}", "options": [${optionsJson}], "answer": "<copied exactly from one of the options above>", "note": "<short explanation, optional>"}`;
}

function formatContextItem(item, labels) {
  let line = `- ${labels.stem}: ${item.stem}`;
  if (item.hasOptions || item.options) line += `\n  ${labels.options}: ${item.options.join(', ')}`;
  line += `\n  ${labels.answer}: ${item.answer}`;
  if (item.note) line += `\n  Note: ${item.note}`;
  return line;
}

/**
 * The full copy-paste prompt for one section (TEACHER_WORKFLOW.md §6/§7):
 * section identity, audience/MCQ constraints, every existing native +
 * GenAI-approved item as style context, the exact count still needed, and
 * an explicit JSON output-format spec with a worked example.
 */
function buildPrompt(subject, sectionNumber, newCount) {
  const section = getSection(subject, sectionNumber);
  if (!section) throw new Error(`Unknown section ${sectionNumber}`);

  const cfg = promptConfig(subject);
  const genaiItems = loadSectionPool(sectionNumber, subject.genaiDir);
  const optionCount = inferOptionCount(subject, sectionNumber);
  const fmt = (item) => formatContextItem(item, cfg.labels);

  const nativeContext = section.items.length
    ? section.items.map(fmt).join('\n\n')
    : '(no existing items in this section yet)';

  const genaiContext = genaiItems.length
    ? '\n\nAdditional previously-approved GenAI items in this exact multiple-choice shape:\n\n' +
      genaiItems.map(fmt).join('\n\n')
    : '';

  const sourceMaterialBlock = section.preamble
    ? `\n${cfg.sourceIntro}\n\n${section.preamble}\n`
    : '';

  const groundingInstruction = section.preamble ? cfg.grounding : '';
  const extraInstruction = [subject.latex ? LATEX_RULES : '', cfg.extra].filter(Boolean).map((t) => `\n\n${t}`).join('');

  return `${cfg.intro}

Section: ${section.label} ${section.number} — ${section.title}
${sourceMaterialBlock}
Every question must be multiple choice — the child selects an option by tapping, never types an answer. ${cfg.matchRule}${groundingInstruction}${extraInstruction}

If the existing items below fall into more than one distinct sub-pattern (for example, ${cfg.subPatternExamples} — sometimes marked with a heading in the source), spread your new questions across all of those sub-patterns in similar proportion to how they appear below. Do not generate every new item in only one sub-pattern.

Existing items in this section (style reference only):

${nativeContext}${genaiContext}

Write exactly ${newCount} NEW multiple-choice questions for this section. Each must have ${optionCount} options: one correct answer plus ${optionCount - 1} plausible-but-wrong distractors of the same kind used in the examples above (e.g. ${cfg.distractorHint}).

Reply with ONLY a JSON array — no explanation before or after it, no markdown code fences, just the raw JSON. Each element must look exactly like this:

{"stem": "...", "options": ["...", "...", "...", "..."], "answer": "...", "note": "..."}

- "stem" — the question text.
- "options" — exactly ${optionCount} distinct, non-empty strings.
- "answer" — copied character-for-character from one of the "options".
- "note" — a short explanation of why that answer is correct (optional but preferred).

Shape of one element (placeholders only — for actual content, style, and vocabulary, follow the existing items above, not this):
${shapeExample(optionCount, cfg.stemPlaceholder)}`;
}

module.exports = { buildPrompt, inferOptionCount };
