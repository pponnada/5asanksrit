const { parseCorpus } = require('./parseCorpus');
const { loadAllCounts } = require('./genaiApprovedStore');

/**
 * All of a subject's sections with the counts the bank and builder screens
 * show (TEACHER_WORKFLOW.md §2): native usable items, and how many
 * GenAI-approved items already exist. Re-reads the subject's corpus and
 * genai-approved pool each call — cheap, and always reflects the latest
 * approvals (REQUIREMENTS.md §9).
 */
function listSections(subject) {
  const { sections } = parseCorpus(subject.corpusFile);
  const genaiCounts = loadAllCounts(subject.genaiDir);

  return sections.map((s) => ({
    number: s.number,
    label: s.label,
    title: s.title,
    nativeUsableCount: s.items.filter((i) => i.status === 'Confirmed' && i.hasOptions).length,
    genaiApprovedCount: genaiCounts[s.number] || 0,
    corpusOnly: subject.corpusOnlySections.includes(s.number),
  }));
}

/** One section's full parsed content (all items, not just usable ones) — used to build prompt context. */
function getSection(subject, number) {
  const { sections } = parseCorpus(subject.corpusFile);
  return sections.find((s) => s.number === number) || null;
}

module.exports = { listSections, getSection };
