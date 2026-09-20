const fs = require('fs');
const path = require('path');
const { parseItemBlocks } = require('./itemBlocks');

const ITEM_RE = /^G(\d+-\d+):\s?(.*)$/;

function vibhagaFileName(sectionNumber) {
  return `vibhaga-${String(sectionNumber).padStart(2, '0')}.md`;
}

/**
 * Parses one genai-approved/vibhaga-<NN>.md file. Returns [] if the file
 * doesn't exist (a section with no GenAI-approved items yet simply has no
 * file — see REQUIREMENTS.md §5/§3, this is what makes a corpus-only paper
 * trivial: just don't read this file).
 */
function parseGenaiApprovedFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  return parseItemBlocks(lines, ITEM_RE).map((item) => ({
    id: 'G' + item.id,
    stem: item.stem,
    options: item.options,
    answer: item.answer,
    status: item.status,
    note: item.note,
    hasOptions: item.hasOptions,
    sourceSection: item.extra['Source-Section'] || null,
    approved: item.extra['Approved'] || null,
  }));
}

/** Loads the GenAI-approved items for one section (by number), if any. */
function loadGenaiApprovedForSection(sectionNumber, dir) {
  return parseGenaiApprovedFile(path.join(dir, vibhagaFileName(sectionNumber)));
}

/** Loads GenAI-approved items for every section that has a file, keyed by section number. */
function loadAllGenaiApproved(dir) {
  const bySection = {};
  if (!fs.existsSync(dir)) return bySection;
  for (const filename of fs.readdirSync(dir)) {
    const match = filename.match(/^vibhaga-(\d+)\.md$/);
    if (!match) continue;
    const sectionNumber = parseInt(match[1], 10);
    bySection[sectionNumber] = parseGenaiApprovedFile(path.join(dir, filename));
  }
  return bySection;
}

module.exports = {
  vibhagaFileName,
  parseGenaiApprovedFile,
  loadGenaiApprovedForSection,
  loadAllGenaiApproved,
};
