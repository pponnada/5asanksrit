const fs = require('fs');
const path = require('path');
const { parseCorpus } = require('./parseCorpus');
const { loadSectionPool } = require('./genaiApprovedStore');
const { CORPUS_FILE, GENAI_APPROVED_DIR, PAPERS_DIR } = require('../config');

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
 * draft.sections = [{ number, count }, ...].
 *
 * For each section, in ascending section-number order: a random sample
 * (size = count) without replacement from native-usable ∪ GenAI-approved
 * — the section's question bank (server/content/bankDraft.js,
 * server/routes/questionBank.js build this up ahead of time; composing a
 * paper only ever draws from it, never generates anything new).
 */
function composePaper(draft) {
  const { sections: corpusSections } = parseCorpus(CORPUS_FILE);
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
    sectionLabels.push(`विभागः ${sec.number}`);

    const nativeUsable = corpusSection.items
      .filter((i) => i.status === 'Confirmed' && i.hasOptions)
      .map((i) => ({ id: i.id, stem: i.stem, options: i.options, answer: i.answer, note: i.note }));
    const genaiPool = loadSectionPool(sec.number, GENAI_APPROVED_DIR);

    const picks = sample(nativeUsable.concat(genaiPool), sec.count || 0);
    allItems.push(...picks);
  }

  const id = makeId(new Date());
  const headerLines = [
    `# Paper ${id}`,
    '',
    `Sections: ${sectionLabels.join(', ')}`,
    `Time-Limit-Minutes: ${draft.timeLimitMinutes}`,
    `Composed-At: ${new Date().toISOString()}`,
    '',
  ];

  const body = allItems.map(formatItemBlock).join('\n\n');
  const contents = headerLines.join('\n') + '\n' + body + '\n';

  fs.mkdirSync(PAPERS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PAPERS_DIR, id + '.md'), contents, 'utf8');

  return id;
}

module.exports = { composePaper, makeId, formatItemBlock };
