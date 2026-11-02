const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// subjects.js reads SUBJECTS_DIR from config.js at require time, so the env
// var must be set before anything requires it — same pattern as
// composePaper.test.js.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-prompt-test-'));
const { writeSubject } = require('./helpers/subjectFixture');

const corpusText = `# QA Corpus

## विभागः 5 — गीतस्य पंक्तिः पूरयत (Complete the lines)

Source poems supplied by Teacher:

Poem 1:
चलति गजः तु मन्दम् मन्दम्।
धावति हरिणः तीव्रम् तीव्रम्॥

Q015: गजः चलति तु _______ _______ ।
Answer: मन्दम् मन्दम्
Status: Confirmed

## विभागः 9 — testing (Testing)

Q010: प्रश्नः?
विकल्पाः: क, ख, ग, घ
Answer: क
Status: Confirmed
`;

process.env.SUBJECTS_DIR = writeSubject(tmpDir, 'sanskrit', corpusText, {
  prompt: { intro: 'INTRO LINE', labels: { stem: 'STEMLABEL' } },
});

const { buildPrompt } = require('../content/buildPrompt');
const { getSubject } = require('../content/subjects');
const subject = getSubject('sanskrit');

test('a section with source material includes it verbatim and instructs the LLM to draw only from it', () => {
  const prompt = buildPrompt(subject, 5, 2);
  assert.match(prompt, /चलति गजः तु मन्दम् मन्दम्/);
  assert.match(prompt, /धावति हरिणः तीव्रम् तीव्रम्/);
  assert.match(prompt, /ONLY material your new items may draw on/);
  assert.match(prompt, /must be built strictly from the source material above/);
});

test('a section with no source material omits the grounding instruction entirely', () => {
  const prompt = buildPrompt(subject, 9, 2);
  assert.doesNotMatch(prompt, /ONLY material your new items may draw on/);
  assert.doesNotMatch(prompt, /must be built strictly from the source material above/);
});

test('subject.json prompt wording replaces the defaults, and the heading echoes the corpus label', () => {
  const prompt = buildPrompt(subject, 9, 2);
  assert.match(prompt, /^INTRO LINE/);
  assert.match(prompt, /Section: विभागः 9 — testing/);
  assert.match(prompt, /- STEMLABEL: प्रश्नः\?/);
});

test('works for a non-Devanagari section heading and lesson-style source material', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-prompt-math-'));
  writeSubject(dir, 'math', '## Lesson 2 — Multiplying (Fractions)\n\nExample: $\\frac{1}{2} \\times 4 = 2$\n', {});
  // config.js was already loaded with the first SUBJECTS_DIR, so build the subject object directly.
  const mathSubject = Object.assign({}, subject, {
    corpusFile: path.join(dir, 'subjects', 'math', 'corpus.md'),
    genaiDir: path.join(dir, 'subjects', 'math', 'genai-approved'),
    prompt: { sourceIntro: 'LESSON TEXT:', grounding: ' GROUNDED.' },
  });
  const prompt = buildPrompt(mathSubject, 2, 3);
  assert.match(prompt, /Section: Lesson 2 — Multiplying/);
  assert.match(prompt, /LESSON TEXT:/);
  assert.match(prompt, /\\frac\{1\}\{2\}/);
  assert.match(prompt, /GROUNDED\./);
});
