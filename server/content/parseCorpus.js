const fs = require('fs');
const { parseItemBlocks } = require('./itemBlocks');

const SECTION_RE = /^##\s+विभागः\s+(\d+)\s+—\s+(.+)$/;
const SUBHEADING_RE = /^###\s+/;
const ITEM_RE = /^Q(\S+):\s?(.*)$/;

/**
 * Parses qa-corpus.md into { sections: [{ number, title, items: [...] }] }.
 *
 * Simplification (see REQUIREMENTS.md §4 / implementation plan): an item
 * only counts as "usable" (hasOptions: true) if it already carries a
 * विकल्पाः line. Native items without one (mostly translation/fill-blank
 * sections) are parsed but excluded from paper pools until the
 * TEACHER_WORKFLOW.md drafting workflow produces a GenAI-approved
 * replacement for that style of question — this file is never edited to
 * retrofit options onto an existing native item, to keep native vs.
 * GenAI content in strictly separate files.
 */
function parseCorpus(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rawLines = text.split('\n');

  // Sub-headings (### ...) inside a section are organizational only — strip
  // them so they don't get mistaken for item content, but they never start
  // a new section.
  const lines = rawLines.filter((l) => !SUBHEADING_RE.test(l));

  const sections = [];

  function flushSection(section) {
    if (section) {
      section.items = parseItemBlocks(section.lines, ITEM_RE).map((item) => ({
        id: 'Q' + item.id,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        status: item.status,
        note: item.note,
        hasOptions: item.hasOptions,
      }));
      delete section.lines;
      sections.push(section);
    }
  }

  let current = null;
  for (const line of lines) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      flushSection(current);
      current = {
        number: parseInt(sectionMatch[1], 10),
        title: sectionMatch[2].trim(),
        lines: [],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flushSection(current);

  return { sections };
}

module.exports = { parseCorpus };
