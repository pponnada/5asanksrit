const fs = require('fs');
const path = require('path');

/**
 * Reads/writes genai-approved/vibhaga-<NN>.json — one file per section that
 * has any GenAI-approved items (see TEACHER_WORKFLOW.md §8, REQUIREMENTS.md
 * §5). Replaces the old Markdown format: items are already validated as
 * JSON when parsed out of a pasted LLM reply (parseGenAiReply.js), so this
 * stores them as JSON directly rather than round-tripping through Markdown.
 */

function vibhagaFileName(sectionNumber) {
  return `vibhaga-${String(sectionNumber).padStart(2, '0')}.json`;
}

function filePath(dir, sectionNumber) {
  return path.join(dir, vibhagaFileName(sectionNumber));
}

/** All approved items for one section, [] if the section has no pool file yet. */
function loadSectionPool(sectionNumber, dir) {
  const fp = filePath(dir, sectionNumber);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

/** Section number -> approved-item count, for every section that has a pool file. */
function loadAllCounts(dir) {
  const counts = {};
  if (!fs.existsSync(dir)) return counts;
  for (const filename of fs.readdirSync(dir)) {
    const match = filename.match(/^vibhaga-(\d+)\.json$/);
    if (!match) continue;
    const sectionNumber = parseInt(match[1], 10);
    counts[sectionNumber] = loadSectionPool(sectionNumber, dir).length;
  }
  return counts;
}

function nextSeq(existingItems) {
  let max = 0;
  for (const item of existingItems) {
    const m = /^G\d+-(\d+)$/.exec(item.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

/**
 * Appends newly Teacher-approved items to a section's pool, assigning each
 * the next G<NN>-<seq> id and stamping Confirmed/Source-Section/Approved
 * metadata. Returns the stamped items (with ids) so the caller can track
 * which ones this build session just added.
 */
function appendApprovedItems(sectionNumber, items, dir) {
  const existing = loadSectionPool(sectionNumber, dir);
  let seq = nextSeq(existing);
  const nn = String(sectionNumber).padStart(2, '0');
  const today = new Date().toISOString().slice(0, 10);

  const stamped = items.map((item) => ({
    id: `G${nn}-${String(seq++).padStart(3, '0')}`,
    stem: item.stem,
    options: item.options,
    answer: item.answer,
    status: 'Confirmed',
    note: item.note || null,
    sourceSection: `विभागः ${sectionNumber}`,
    approved: today,
  }));

  const combined = existing.concat(stamped);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath(dir, sectionNumber), JSON.stringify(combined, null, 2) + '\n', 'utf8');

  return stamped;
}

module.exports = { vibhagaFileName, loadSectionPool, loadAllCounts, appendApprovedItems };
