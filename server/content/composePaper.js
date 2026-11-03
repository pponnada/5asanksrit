const fs = require('fs');
const path = require('path');
const { parseCorpus } = require('./parseCorpus');
const { loadSectionPool } = require('./genaiApprovedStore');
const { PAPERS_DIR } = require('../config');
const { shuffled } = require('./shuffle');

/** Random sample without replacement, up to `n` (or fewer if the pool is smaller). */
function sample(array, n) {
  const pool = array.slice();
  const picked = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/**
 * Reorders each item's options so the correct answer's position (A, B, C, ...) is spread evenly across
 * the paper instead of whatever order the bank stored (GenAI items always had it first). A "deck" of
 * target positions is dealt out round-robin and shuffled, so counts differ by at most one per position;
 * distractors are shuffled into the remaining slots. Returns new items; the inputs are not mutated.
 */
function balanceAnswerPositions(items) {
  const maxLen = items.reduce((m, i) => Math.max(m, i.options.length), 0);
  const deck = shuffled(items.map((_, k) => k % Math.max(maxLen, 1)));
  return items.map((item, k) => {
    const answerIdx = item.options.indexOf(item.answer);
    if (answerIdx === -1) return { ...item, options: shuffled(item.options) };
    const target = deck[k] % item.options.length;
    const distractors = shuffled(item.options.filter((_, i) => i !== answerIdx));
    const options = distractors.slice();
    options.splice(target, 0, item.answer);
    return { ...item, options };
  });
}

function formatItemBlock(item) {
  const lines = [`${item.id}: ${item.stem}`, `विकल्पाः: ${item.options.join(', ')}`, `Answer: ${item.answer}`];
  if (item.note) lines.push(`Note: ${item.note}`);
  return lines.join('\n');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function makeId(now) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
}

/**
 * Writes papers/<id>.md as a Draft (no Published-At — REQUIREMENTS.md §5)
 * from a resolved builder draft (server/content/builderDraft.js shape):
 * draft.sections = [{ number, count }, ...], for the given subject.
 *
 * For each section, in ascending section-number order: a random sample
 * (size = count) without replacement from native-usable ∪ GenAI-approved
 * — the section's question bank (server/content/bankDraft.js,
 * server/routes/questionBank.js build this up ahead of time; composing a
 * paper only ever draws from it, never generates anything new).
 */
function composePaper(subject, draft) {
  const { sections: corpusSections } = parseCorpus(subject.corpusFile);
  const corpusByNumber = {};
  corpusSections.forEach((s) => {
    corpusByNumber[s.number] = s;
  });

  const orderedSections = draft.sections.slice().sort((a, b) => a.number - b.number);
  const allItems = [];
  const sectionLabels = [];

  for (const sec of orderedSections) {
    const corpusSection = corpusByNumber[sec.number];
    if (!corpusSection) continue;
    sectionLabels.push(`${corpusSection.label} ${sec.number}`);

    const nativeUsable = corpusSection.items
      .filter((i) => i.status === 'Confirmed' && i.hasOptions)
      .map((i) => ({ id: i.id, stem: i.stem, options: i.options, answer: i.answer, note: i.note }));
    const genaiPool = loadSectionPool(sec.number, subject.genaiDir);

    const picks = sample(nativeUsable.concat(genaiPool), sec.count || 0);
    allItems.push(...picks);
  }

  fs.mkdirSync(PAPERS_DIR, { recursive: true });
  const baseId = makeId(new Date());
  // Two papers composed within the same minute (e.g. one per subject) must not overwrite each other.
  let id = baseId;
  for (let n = 2; fs.existsSync(path.join(PAPERS_DIR, id + '.md')); n++) id = `${baseId}-${n}`;

  const headerLines = [
    `# Paper ${id}`,
    '',
    `Subject: ${subject.id}`,
    `Sections: ${sectionLabels.join(', ')}`,
    `Time-Limit-Minutes: ${draft.timeLimitMinutes}`,
    `Composed-At: ${new Date().toISOString()}`,
    '',
  ];

  const body = balanceAnswerPositions(allItems).map(formatItemBlock).join('\n\n');
  const contents = headerLines.join('\n') + '\n' + body + '\n';

  fs.writeFileSync(path.join(PAPERS_DIR, id + '.md'), contents, 'utf8');

  return id;
}

module.exports = { composePaper, balanceAnswerPositions, makeId, formatItemBlock };
