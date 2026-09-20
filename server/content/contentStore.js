const { loadPaper, listPaperIds, getLatestPaperId } = require('./parsePaper');
const { PAPERS_DIR, LATEST_FILE } = require('../config');

function getLatestId() {
  return getLatestPaperId(LATEST_FILE);
}

function getPaper(id) {
  return loadPaper(PAPERS_DIR, id);
}

/** Every published paper (Published-At set), newest first. */
function listPublishedPapers() {
  return listPaperIds(PAPERS_DIR)
    .map((id) => getPaper(id))
    .filter((p) => p && p.publishedAt);
}

/** Every composed paper regardless of publish state, newest first — for the admin dashboard. */
function listAllPapers() {
  return listPaperIds(PAPERS_DIR)
    .map((id) => getPaper(id))
    .filter(Boolean);
}

module.exports = { getLatestId, getPaper, listPublishedPapers, listAllPapers };
