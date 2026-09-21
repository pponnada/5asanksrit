const { parseCorpus } = require('./parseCorpus');
const { loadAllCounts } = require('./genaiApprovedStore');
const { CORPUS_FILE, GENAI_APPROVED_DIR } = require('../config');

/**
 * All 26 sections with the counts the builder's section-selection screen
 * shows (TEACHER_WORKFLOW.md §2): native usable items, and how many
 * GenAI-approved items already exist. Re-reads qa-corpus.md and the
 * genai-approved pool each call — cheap, and always reflects the latest
 * approvals from the running build (REQUIREMENTS.md §9).
 */
function listSections() {
  const { sections } = parseCorpus(CORPUS_FILE);
  const genaiCounts = loadAllCounts(GENAI_APPROVED_DIR);

  return sections.map((s) => ({
    number: s.number,
    title: s.title,
    nativeUsableCount: s.items.filter((i) => i.status === 'Confirmed' && i.hasOptions).length,
    genaiApprovedCount: genaiCounts[s.number] || 0,
  }));
}

/** One section's full parsed content (all items, not just usable ones) — used to build prompt context. */
function getSection(number) {
  const { sections } = parseCorpus(CORPUS_FILE);
  return sections.find((s) => s.number === number) || null;
}

module.exports = { listSections, getSection };
