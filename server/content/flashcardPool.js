const { parseCorpus } = require('./parseCorpus');
const { CORPUS_FILE } = require('../config');

const MEANINGS_SECTION_NUMBER = 1;

// If a Meanings answer carries a Latin-script parenthetical (e.g. a future
// corpus entry like "बादल (Cloud)"), surface it separately as the English
// meaning when the card is flipped — see TEACHER_WORKFLOW.md's rendering
// note on why the app itself never displays raw Devanagari headings, but
// item content (here, corpus data) is untouched either way.
const ENGLISH_GLOSS_RE = /\(([A-Za-z][A-Za-z .'-]*)\)/;

/**
 * Loads विभागः 1 (Meanings) as the flashcard pool — corpus-only, per
 * TEACHER_WORKFLOW.md (Meanings is never mixed with GenAI content), and
 * restricted to Confirmed items that already carry MCQ options.
 */
function loadFlashcardPool() {
  const { sections } = parseCorpus(CORPUS_FILE);
  const meanings = sections.find((s) => s.number === MEANINGS_SECTION_NUMBER);
  if (!meanings) return [];

  return meanings.items
    .filter((item) => item.status === 'Confirmed' && item.hasOptions)
    .map((item) => {
      const englishMatch = item.answer.match(ENGLISH_GLOSS_RE);
      return {
        id: item.id,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        note: item.note,
        englishMeaning: englishMatch ? englishMatch[1].trim() : null,
      };
    });
}

module.exports = { loadFlashcardPool };
