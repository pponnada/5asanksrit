const fs = require('node:fs');
const path = require('node:path');

/**
 * Writes subjects/<id>/{subject.json,corpus.md,genai-approved/} under
 * tmpDir/subjects and returns that SUBJECTS_DIR. Set process.env.SUBJECTS_DIR
 * to it *before* requiring any app module (config.js reads it once).
 */
function writeSubject(tmpDir, id, corpusText, config = {}) {
  const subjectsDir = path.join(tmpDir, 'subjects');
  const dir = path.join(subjectsDir, id);
  fs.mkdirSync(path.join(dir, 'genai-approved'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'corpus.md'), corpusText, 'utf8');
  fs.writeFileSync(path.join(dir, 'subject.json'), JSON.stringify(config), 'utf8');
  return subjectsDir;
}

module.exports = { writeSubject };
