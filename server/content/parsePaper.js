const fs = require('fs');
const path = require('path');
const { parseItemBlocks } = require('./itemBlocks');

// A paper's items reuse native Qxxx or GenAI-approved G<NN>-<seq> IDs
// verbatim — no re-prefixing needed here, unlike parseCorpus/parseGenaiApproved.
const ITEM_RE = /^([QG]\S+):\s?(.*)$/;
const HEADER_FIELD_RE = /^([A-Za-z][A-Za-z-]*):\s?(.*)$/;

/**
 * Parses papers/<id>.md: a header block of "Key: value" metadata lines,
 * then a blank line, then the resolved item list (same per-item shape as
 * qa-corpus.md, minus Status since inclusion already implies it was usable).
 */
function parsePaperFile(filePath) {
  const id = path.basename(filePath, '.md');
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  const header = {};
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (line.startsWith('#')) continue; // title line, e.g. "# Paper 2026-09-20-1904"
    if (line.trim() === '') {
      if (Object.keys(header).length > 0) {
        bodyStart = i + 1;
        break;
      }
      continue;
    }
    const fieldMatch = line.match(HEADER_FIELD_RE);
    if (fieldMatch) {
      header[fieldMatch[1]] = fieldMatch[2].trim();
      bodyStart = i + 1;
    } else {
      break;
    }
  }

  const bodyLines = lines.slice(bodyStart);
  const items = parseItemBlocks(bodyLines, ITEM_RE).map((item) => ({
    id: item.id,
    stem: item.stem,
    options: item.options || [],
    answer: item.answer,
    note: item.note,
  }));

  const sections = (header['Sections'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id,
    sections,
    timeLimitMinutes: parseInt(header['Time-Limit-Minutes'], 10) || null,
    composedAt: header['Composed-At'] || null,
    publishedAt: header['Published-At'] || null,
    items,
  };
}

function loadPaper(papersDir, id) {
  const filePath = path.join(papersDir, id + '.md');
  if (!fs.existsSync(filePath)) return null;
  return parsePaperFile(filePath);
}

/** All composed papers (published or draft), newest id first. */
function listPaperIds(papersDir) {
  if (!fs.existsSync(papersDir)) return [];
  return fs
    .readdirSync(papersDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort()
    .reverse();
}

function getLatestPaperId(latestFile) {
  if (!fs.existsSync(latestFile)) return null;
  const id = fs.readFileSync(latestFile, 'utf8').trim();
  return id || null;
}

function setLatestPaperId(latestFile, id) {
  fs.writeFileSync(latestFile, id + '\n', 'utf8');
}

/**
 * Stamps Published-At into papers/<id>.md if it isn't already set (a paper
 * being re-promoted to latest keeps its original publish timestamp). This
 * is what makes "publish" durable and independent of latest.txt — an older
 * paper that gets superseded stays reachable/takeable because it still has
 * this stamp, even once it's no longer the "latest" pointer target.
 */
function markPublished(papersDir, id) {
  const filePath = path.join(papersDir, id + '.md');
  const text = fs.readFileSync(filePath, 'utf8');
  if (/^Published-At:/m.test(text)) return; // already published once — leave it alone

  const lines = text.split('\n');
  // Mirror parsePaperFile's own header-detection: skip the title line and
  // any leading blank lines, then insert right after the last "Key: value"
  // header field — i.e. at the blank line that terminates the header block,
  // not the (possible) blank line separating the title from it.
  let insertAt = lines.length;
  let sawHeaderField = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) continue;
    if (line.trim() === '') {
      if (sawHeaderField) {
        insertAt = i;
        break;
      }
      continue;
    }
    if (HEADER_FIELD_RE.test(line)) {
      sawHeaderField = true;
      insertAt = i + 1;
    } else {
      break;
    }
  }
  lines.splice(insertAt, 0, `Published-At: ${new Date().toISOString()}`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/** Publishes a paper: stamps it (if needed) and points latest.txt at it. */
function publishPaper(papersDir, latestFile, id) {
  markPublished(papersDir, id);
  setLatestPaperId(latestFile, id);
}

module.exports = {
  parsePaperFile,
  loadPaper,
  listPaperIds,
  getLatestPaperId,
  setLatestPaperId,
  markPublished,
  publishPaper,
};
