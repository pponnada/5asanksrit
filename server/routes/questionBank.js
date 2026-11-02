const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const sectionSummary = require('../content/sectionSummary');
const genaiApprovedStore = require('../content/genaiApprovedStore');
const bankDraft = require('../content/bankDraft');
const { buildPrompt, inferOptionCount } = require('../content/buildPrompt');
const { parseGenAiReply, validateItem } = require('../content/parseGenAiReply');
const loadSubject = require('../middleware/loadSubject');
const { DEFAULT_SUBJECT } = require('../content/subjects');

const router = express.Router();
router.param('subject', loadSubject);
const urlencoded = express.urlencoded({ extended: false });

// Same rationale as server/routes/builder.js: guarantee req.body is always
// an object, since every POST handler below reads it directly.
function parseForm(req, res, next) {
  urlencoded(req, res, () => {
    if (!req.body) req.body = {};
    next();
  });
}

// ---------- Section list ----------

// Pre-subjects bookmark.
router.get('/admin/bank', requireAdmin, (_req, res) => res.redirect('/admin/s/' + DEFAULT_SUBJECT + '/bank'));

router.get('/admin/s/:subject/bank', requireAdmin, (req, res) => {
  res.render('admin/bank-list', { sections: sectionSummary.listSections(req.subject) });
});

// ---------- Per-section bank ----------

router.get('/admin/s/:subject/bank/:n', requireAdmin, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const summary = sectionSummary.listSections(req.subject).find((s) => s.number === n);
  if (!summary) return res.redirect(res.locals.base + '/bank');

  const corpusOnly = summary.corpusOnly;
  const approvedItems = corpusOnly ? [] : genaiApprovedStore.loadSectionPool(n, req.subject.genaiDir);
  const pending = corpusOnly ? null : bankDraft.get(req.subject.id, n);

  res.render('admin/bank-section', {
    section: {
      number: n,
      label: summary.label,
      title: summary.title,
      nativeUsableCount: summary.nativeUsableCount,
      corpusOnly,
      approvedItems,
      pending,
      prompt: pending && pending.requestedCount > 0 ? buildPrompt(req.subject, n, pending.requestedCount) : null,
    },
    error: null,
  });
});

router.post('/admin/s/:subject/bank/:n/start', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const back = res.locals.base + '/bank/' + n;
  if (req.subject.corpusOnlySections.includes(n)) return res.redirect(back);

  const count = parseInt(req.body.count, 10);
  if (!count || count <= 0) return res.redirect(back);

  bankDraft.start(req.subject.id, n, count);
  res.redirect(back);
});

router.post('/admin/s/:subject/bank/:n/parse', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const back = res.locals.base + '/bank/' + n;
  const pending = bankDraft.get(req.subject.id, n);
  if (req.subject.corpusOnlySections.includes(n) || !pending) return res.redirect(back);

  const optionCount = inferOptionCount(req.subject, n);
  const pasted = req.body.pasted || '';
  const result = parseGenAiReply(pasted, {
    expectedCount: pending.requestedCount,
    expectedOptionCount: optionCount,
    latex: req.subject.latex,
  });

  bankDraft.setPending(req.subject.id, n, { raw: pasted, items: result.items, errors: result.errors });
  res.redirect(back);
});

router.post('/admin/s/:subject/bank/:n/approve', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const back = res.locals.base + '/bank/' + n;
  const pending = bankDraft.get(req.subject.id, n);
  if (req.subject.corpusOnlySections.includes(n) || !pending) return res.redirect(back);

  const optionCount = inferOptionCount(req.subject, n);
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

    const { item, error } = validateItem(raw, { expectedOptionCount: optionCount, latex: req.subject.latex });
    if (error) {
      errors.push(`Item ${i + 1}: ${error}.`);
    } else {
      approvedRaw.push(item);
    }
  });

  if (errors.length > 0) {
    bankDraft.setPending(req.subject.id, n, { raw: pending.raw, items: pending.items, errors });
    return res.redirect(back);
  }

  if (approvedRaw.length > 0) {
    const section = sectionSummary.listSections(req.subject).find((s) => s.number === n);
    genaiApprovedStore.appendApprovedItems(n, approvedRaw, req.subject.genaiDir, {
      idPrefix: req.subject.idPrefix,
      sectionLabel: section ? section.label : undefined,
    });
  }

  // Round finished either way — back to "how many more?" for this section.
  bankDraft.clear(req.subject.id, n);
  res.redirect(back);
});

router.post('/admin/s/:subject/bank/:n/cancel', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  bankDraft.clear(req.subject.id, n);
  res.redirect(res.locals.base + '/bank/' + n);
});

module.exports = router;
