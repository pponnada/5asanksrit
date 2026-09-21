const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const sectionSummary = require('../content/sectionSummary');
const genaiApprovedStore = require('../content/genaiApprovedStore');
const bankDraft = require('../content/bankDraft');
const { buildPrompt, inferOptionCount } = require('../content/buildPrompt');
const { parseGenAiReply, validateItem } = require('../content/parseGenAiReply');
const { GENAI_APPROVED_DIR } = require('../config');

const router = express.Router();
const urlencoded = express.urlencoded({ extended: false });

// Same rationale as server/routes/builder.js: guarantee req.body is always
// an object, since every POST handler below reads it directly.
function parseForm(req, res, next) {
  urlencoded(req, res, () => {
    if (!req.body) req.body = {};
    next();
  });
}

const MEANINGS_SECTION = 1;

// ---------- Section list ----------

router.get('/admin/bank', requireAdmin, (_req, res) => {
  const sections = sectionSummary.listSections().map((s) => ({
    number: s.number,
    title: s.title,
    nativeUsableCount: s.nativeUsableCount,
    genaiApprovedCount: s.genaiApprovedCount,
    isMeanings: s.number === MEANINGS_SECTION,
  }));
  res.render('admin/bank-list', { sections });
});

// ---------- Per-section bank ----------

router.get('/admin/bank/:n', requireAdmin, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const summary = sectionSummary.listSections().find((s) => s.number === n);
  if (!summary) return res.redirect('/admin/bank');

  const isMeanings = n === MEANINGS_SECTION;
  const approvedItems = isMeanings ? [] : genaiApprovedStore.loadSectionPool(n, GENAI_APPROVED_DIR);
  const pending = isMeanings ? null : bankDraft.get(n);

  res.render('admin/bank-section', {
    section: {
      number: n,
      title: summary.title,
      nativeUsableCount: summary.nativeUsableCount,
      isMeanings,
      approvedItems,
      pending,
      prompt: pending && pending.requestedCount > 0 ? buildPrompt(n, pending.requestedCount) : null,
    },
    error: null,
  });
});

router.post('/admin/bank/:n/start', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (n === MEANINGS_SECTION) return res.redirect('/admin/bank/' + n);

  const count = parseInt(req.body.count, 10);
  if (!count || count <= 0) return res.redirect('/admin/bank/' + n);

  bankDraft.start(n, count);
  res.redirect('/admin/bank/' + n);
});

router.post('/admin/bank/:n/parse', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const pending = bankDraft.get(n);
  if (n === MEANINGS_SECTION || !pending) return res.redirect('/admin/bank/' + n);

  const optionCount = inferOptionCount(n);
  const pasted = req.body.pasted || '';
  const result = parseGenAiReply(pasted, { expectedCount: pending.requestedCount, expectedOptionCount: optionCount });

  bankDraft.setPending(n, { raw: pasted, items: result.items, errors: result.errors });
  res.redirect('/admin/bank/' + n);
});

router.post('/admin/bank/:n/approve', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const pending = bankDraft.get(n);
  if (n === MEANINGS_SECTION || !pending) return res.redirect('/admin/bank/' + n);

  const optionCount = inferOptionCount(n);
  const approvedRaw = [];
  const errors = [];

  pending.items.forEach((candidate, i) => {
    if (!req.body['approve_' + i]) return; // not checked = rejected, simply dropped

    const optionCountForItem = candidate.options.length;
    const options = [];
    for (let j = 0; j < optionCountForItem; j++) {
      options.push(req.body[`option_${i}_${j}`] || '');
    }
    const raw = {
      stem: req.body['stem_' + i] || '',
      options,
      answer: req.body['answer_' + i] || '',
      note: req.body['note_' + i] || '',
    };

    const { item, error } = validateItem(raw, { expectedOptionCount: optionCount });
    if (error) {
      errors.push(`Item ${i + 1}: ${error}.`);
    } else {
      approvedRaw.push(item);
    }
  });

  if (errors.length > 0) {
    bankDraft.setPending(n, { raw: pending.raw, items: pending.items, errors });
    return res.redirect('/admin/bank/' + n);
  }

  if (approvedRaw.length > 0) {
    genaiApprovedStore.appendApprovedItems(n, approvedRaw, GENAI_APPROVED_DIR);
  }

  // Round finished either way — back to "how many more?" for this section.
  bankDraft.clear(n);
  res.redirect('/admin/bank/' + n);
});

router.post('/admin/bank/:n/cancel', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  bankDraft.clear(n);
  res.redirect('/admin/bank/' + n);
});

module.exports = router;
