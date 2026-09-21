const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// buildPrompt.js reads CORPUS_FILE/GENAI_APPROVED_DIR from config.js at
// require time (via sectionSummary.js), so these env vars must be set
// before it (or config.js) is required anywhere — same pattern as
// composePaper.test.js.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-prompt-test-'));
const corpusFile = path.join(tmpDir, 'qa-corpus.md');
const genaiDir = path.join(tmpDir, 'genai-approved');
fs.mkdirSync(genaiDir);

fs.writeFileSync(
  corpusFile,
  `# QA Corpus

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
`,
  'utf8'
);

process.env.CORPUS_FILE = corpusFile;
process.env.GENAI_APPROVED_DIR = genaiDir;

const { buildPrompt } = require('../content/buildPrompt');

test('a section with source material includes it verbatim and instructs the LLM to draw only from it', () => {
  const prompt = buildPrompt(5, 2);
  assert.match(prompt, /चलति गजः तु मन्दम् मन्दम्/);
  assert.match(prompt, /धावति हरिणः तीव्रम् तीव्रम्/);
  assert.match(prompt, /ONLY material your new items may draw on/);
  assert.match(prompt, /must be built strictly from the source material above/);
});

test('a section with no source material omits the grounding instruction entirely', () => {
  const prompt = buildPrompt(9, 2);
  assert.doesNotMatch(prompt, /ONLY material your new items may draw on/);
  assert.doesNotMatch(prompt, /must be built strictly from the source material above/);
});
