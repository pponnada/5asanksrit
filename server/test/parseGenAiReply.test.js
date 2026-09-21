const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGenAiReply } = require('../content/parseGenAiReply');

const validItem = { stem: 'stem?', options: ['a', 'b', 'c', 'd'], answer: 'a', note: 'why' };

test('parses a clean JSON array', () => {
  const { items, errors } = parseGenAiReply(JSON.stringify([validItem]), { expectedCount: 1, expectedOptionCount: 4 });
  assert.equal(errors.length, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].answer, 'a');
});

test('strips a markdown code fence around the array', () => {
  const text = '```json\n' + JSON.stringify([validItem]) + '\n```';
  const { items, errors } = parseGenAiReply(text, { expectedCount: 1, expectedOptionCount: 4 });
  assert.equal(errors.length, 0);
  assert.equal(items.length, 1);
});

test('extracts the array out of surrounding prose', () => {
  const text = 'Sure, here are the questions:\n' + JSON.stringify([validItem]) + '\nHope this helps!';
  const { items, errors } = parseGenAiReply(text, { expectedCount: 1, expectedOptionCount: 4 });
  assert.equal(errors.length, 0);
  assert.equal(items.length, 1);
});

test('flags an answer that does not match any option, per item, without accepting it', () => {
  const bad = { ...validItem, answer: 'not-an-option' };
  const { items, errors } = parseGenAiReply(JSON.stringify([bad]), { expectedOptionCount: 4 });
  assert.equal(items.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Item 1/);
});

test('reports a count mismatch without silently truncating or padding', () => {
  const { items, errors } = parseGenAiReply(JSON.stringify([validItem, validItem]), {
    expectedCount: 3,
    expectedOptionCount: 4,
  });
  assert.equal(items.length, 2);
  assert.ok(errors.some((e) => e.includes('Asked for 3')));
});

test('rejects non-JSON garbage clearly instead of throwing', () => {
  const { items, errors } = parseGenAiReply('this is not json at all');
  assert.equal(items.length, 0);
  assert.ok(errors.length > 0);
});
