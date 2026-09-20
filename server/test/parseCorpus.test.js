const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseCorpus } = require('../content/parseCorpus');

const CORPUS_FILE = path.join(__dirname, '..', '..', 'qa-corpus.md');

test('parses all 26 sections with no items lost or duplicated', () => {
  const { sections } = parseCorpus(CORPUS_FILE);
  assert.equal(sections.length, 26);

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

test('inline "विकल्पाः:" embedded in the stem line is correctly extracted (विभागः 14/15/16)', () => {
  const { sections } = parseCorpus(CORPUS_FILE);
  for (const num of [14, 15, 16]) {
    const section = sections.find((s) => s.number === num);
    for (const item of section.items) {
      assert.ok(item.hasOptions, `${item.id} in विभागः ${num} should have options`);
      assert.ok(!item.stem.includes('विकल्पाः'), `${item.id}'s stem should not still contain विकल्पाः`);
    }
  }
});

test('translation-only sections (e.g. विभागः 24) have no native options — expected, not a bug', () => {
  const { sections } = parseCorpus(CORPUS_FILE);
  const translations = sections.find((s) => s.number === 24);
  for (const item of translations.items) {
    assert.equal(item.hasOptions, false);
  }
});
