// Shared parser for the "item block" shape used by both qa-corpus.md and
// genai-approved/vibhaga-<NN>.md:
//
//   <ID>: <stem, possibly wrapping onto following lines>
//   विकल्पाः: opt1, opt2, opt3, opt4      (optional; comma- or slash-separated;
//                                           sometimes inline at the end of the
//                                           stem line instead of its own line)
//   Answer: <answer>
//   Status: <status>
//   Note: <note, possibly wrapping>        (optional)
//   <Other-Field>: <value>                 (optional extra metadata, e.g.
//                                           Source-Section / Approved)

const OPTIONS_RE = /^विकल्पाः:\s?(.*)$/;
const ANSWER_RE = /^Answer:\s?(.*)$/;
const STATUS_RE = /^Status:\s?(.*)$/;
const NOTE_RE = /^Note:\s?(.*)$/;
const EXTRA_FIELD_RE = /^([A-Za-z][A-Za-z-]*):\s?(.*)$/; // e.g. Source-Section:, Approved:
const INLINE_OPTIONS_RE = /\s*विकल्पाः:\s?(.*)$/;

function splitOptions(raw) {
  const delimiter = raw.includes(',') ? ',' : '/';
  return raw.split(delimiter).map((s) => s.trim()).filter(Boolean);
}

/**
 * @param {string[]} lines
 * @param {RegExp} itemRe - must capture the ID suffix in group 1 and the
 *   rest of the stem line in group 2, e.g. /^Q(\S+):\s?(.*)$/
 * @param {(line: string) => boolean} [isBoundary] - optional extra line
 *   patterns (e.g. a section heading) that should also end the current item
 *   without being consumed as item content.
 * @param {(line: string) => void} [onStray] - optional callback invoked
 *   with every line that falls outside any item block (e.g. qa-corpus.md's
 *   free-text source material — poems, word banks — interleaved between
 *   items), in file order, so a caller that cares about it doesn't have to
 *   silently lose it.
 * @returns {object[]} flat list of items
 */
function parseItemBlocks(lines, itemRe, isBoundary, onStray) {
  const items = [];
  let currentItem = null;
  let captureField = null; // 'stem' | 'answer' | 'note'

  function finishItem() {
    if (currentItem) {
      currentItem.stem = currentItem.stem.trim();
      currentItem.answer = (currentItem.answer || '').trim();
      currentItem.note = currentItem.note ? currentItem.note.trim() : null;

      if (!currentItem.options) {
        const inlineMatch = currentItem.stem.match(INLINE_OPTIONS_RE);
        if (inlineMatch) {
          currentItem.options = splitOptions(inlineMatch[1]);
          currentItem.stem = currentItem.stem.replace(INLINE_OPTIONS_RE, '').trim();
        }
      }

      currentItem.hasOptions = Array.isArray(currentItem.options) && currentItem.options.length > 0;
      items.push(currentItem);
    }
    currentItem = null;
    captureField = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    if (isBoundary && isBoundary(line)) {
      finishItem();
      continue;
    }

    if (line.trim() === '---') {
      finishItem();
      continue;
    }

    const itemMatch = line.match(itemRe);
    if (itemMatch) {
      finishItem();
      currentItem = {
        id: itemMatch[1],
        stem: itemMatch[2],
        options: null,
        answer: '',
        status: null,
        note: null,
        extra: {},
      };
      captureField = 'stem';
      continue;
    }

    if (!currentItem) {
      if (onStray) onStray(line);
      continue; // stray line outside any item
    }

    const optionsMatch = line.match(OPTIONS_RE);
    if (optionsMatch) {
      currentItem.options = splitOptions(optionsMatch[1]);
      captureField = null;
      continue;
    }

    const answerMatch = line.match(ANSWER_RE);
    if (answerMatch) {
      currentItem.answer = answerMatch[1];
      captureField = 'answer';
      continue;
    }

    const statusMatch = line.match(STATUS_RE);
    if (statusMatch) {
      currentItem.status = statusMatch[1].trim();
      captureField = null;
      continue;
    }

    const noteMatch = line.match(NOTE_RE);
    if (noteMatch) {
      currentItem.note = noteMatch[1];
      captureField = 'note';
      continue;
    }

    if (line.trim() === '') {
      finishItem();
      continue;
    }

    const extraMatch = line.match(EXTRA_FIELD_RE);
    if (extraMatch && captureField !== 'stem') {
      currentItem.extra[extraMatch[1]] = extraMatch[2].trim();
      captureField = null;
      continue;
    }

    if (captureField === 'stem') {
      currentItem.stem += '\n' + line;
    } else if (captureField === 'answer') {
      currentItem.answer += '\n' + line;
    } else if (captureField === 'note') {
      currentItem.note += '\n' + line;
    }
  }
  finishItem();

  return items;
}

module.exports = { parseItemBlocks, splitOptions };
