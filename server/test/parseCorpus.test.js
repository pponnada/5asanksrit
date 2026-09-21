const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseCorpus } = require('../content/parseCorpus');

const CORPUS_FILE = path.join(__dirname, '..', '..', 'qa-corpus.md');

test('parses all 18 sections with no items lost or duplicated', () => {
  const { sections } = parseCorpus(CORPUS_FILE);
  assert.equal(sections.length, 18);

  const ids = new Set();
  let total = 0;
  for (const s of sections) {
    for (const item of s.items) {
      assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
      ids.add(item.id);
      total++;
    }
  }
  assert.equal(total, 294);
});

test('every item is Status: Confirmed (no Needs Teacher Input items currently in the corpus)', () => {
  const { sections } = parseCorpus(CORPUS_FILE);
  for (const s of sections) {
    for (const item of s.items) {
      assert.equal(item.status, 'Confirmed', `${item.id} has status ${item.status}`);
    }
  }
});

test('विभागः 1 (Meanings) is fully MCQ-ready: all 162 items have options', () => {
  const { sections } = parseCorpus(CORPUS_FILE);
  const meanings = sections.find((s) => s.number === 1);
  assert.equal(meanings.items.length, 162);
  for (const item of meanings.items) {
    assert.ok(item.hasOptions, `${item.id} is missing options`);
    assert.ok(item.options.length >= 2);
  }
});

test('inline "विकल्पाः:" embedded in the stem line is correctly extracted (विभागः 11, and the "विकल्पेभ्यः चयनम्" sub-group of विभागः 8)', () => {
  const { sections } = parseCorpus(CORPUS_FILE);

  const section11 = sections.find((s) => s.number === 11);
  for (const item of section11.items) {
    assert.ok(item.hasOptions, `${item.id} in विभागः 11 should have options`);
    assert.ok(!item.stem.includes('विकल्पाः'), `${item.id}'s stem should not still contain विकल्पाः`);
  }

  const section8 = sections.find((s) => s.number === 8);
  const withOptions = section8.items.filter((i) => i.hasOptions);
  assert.equal(withOptions.length, 4); // only the "विकल्पेभ्यः चयनम्" sub-group; the other two sub-groups have no embedded options
  for (const item of withOptions) {
    assert.ok(!item.stem.includes('विकल्पाः'), `${item.id}'s stem should not still contain विकल्पाः`);
  }
});

test('translation-only sections (e.g. विभागः 18) have no native options — expected, not a bug', () => {
  const { sections } = parseCorpus(CORPUS_FILE);
  const translations = sections.find((s) => s.number === 18);
  for (const item of translations.items) {
    assert.equal(item.hasOptions, false);
  }
});
