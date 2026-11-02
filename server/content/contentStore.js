const { loadPaper, listPaperIds, getLatestPaperId } = require('./parsePaper');
const { PAPERS_DIR } = require('../config');

/** The paper the Student's "Take Test" button opens for this subject (a subject object from subjects.js). */
function getLatestId(subject) {
  return getLatestPaperId(subject.latestFile);
}

function getPaper(id) {
  return loadPaper(PAPERS_DIR, id);
}

/** Every published paper of one subject (Published-At set), newest first. */
function listPublishedPapers(subject) {
  return listPaperIds(PAPERS_DIR)
    .map((id) => getPaper(id))
    .filter((p) => p && p.publishedAt && p.subject === subject.id);
}

/** Every composed paper of every subject regardless of publish state, newest first — for the admin dashboard. */
function listAllPapers() {
  return listPaperIds(PAPERS_DIR)
    .map((id) => getPaper(id))
    .filter(Boolean);
}

module.exports = { getLatestId, getPaper, listPublishedPapers, listAllPapers };
