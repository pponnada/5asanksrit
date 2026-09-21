const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const sectionSummary = require('../content/sectionSummary');
const builderDraft = require('../content/builderDraft');
const { composePaper } = require('../content/composePaper');

const router = express.Router();
const urlencoded = express.urlencoded({ extended: false });

// body-parser leaves req.body undefined (not {}) whenever there's no body
// or the Content-Type doesn't match — every POST handler below reads
// req.body directly, so guarantee it's always an object.
function parseForm(req, res, next) {
  urlencoded(req, res, () => {
    if (!req.body) req.body = {};
    next();
  });
}

/** Each section's count is a draw against its bank (native usable + GenAI-approved) — never more than what's actually there. */
function available(s) {
  return s.nativeUsableCount + s.genaiApprovedCount;
}

// ---------- Step 1: select sections + counts, drawn from each section's question bank ----------

router.get('/admin/builder', requireAdmin, (_req, res) => {
  const sections = sectionSummary.listSections();
  const draftSections = builderDraft.getDraft().sections;
  res.render('admin/builder-sections', {
    sections: sections.map((s) => Object.assign({ available: available(s) }, s)),
    selected: draftSections,
    error: null,
  });
});

router.post('/admin/builder/sections', requireAdmin, parseForm, (req, res) => {
  const sections = sectionSummary.listSections();
  const selected = [];
  let error = null;

  sections.forEach((s) => {
    const checked = req.body['select_' + s.number];
    const countRaw = req.body['count_' + s.number];
    const count = parseInt(countRaw, 10);
    if (!checked || !(count > 0)) return;

    const max = available(s);
    if (count > max) {
      error = `विभागः ${s.number}: only ${max} question(s) banked — lower the count or add more via Manage Question Bank.`;
    }
    selected.push({ number: s.number, count: Math.min(count, max) });
  });

  if (selected.length === 0) error = 'Select at least one section and a question count for it.';

  if (error) {
    return res.render('admin/builder-sections', {
      sections: sections.map((s) => Object.assign({ available: available(s) }, s)),
      selected: {},
      error,
    });
  }

  builderDraft.setSections(selected);
  res.redirect('/admin/builder/time');
});

// ---------- Step 2: time limit, then compose ----------

router.get('/admin/builder/time', requireAdmin, (_req, res) => {
  if (builderDraft.sectionsList().length === 0) return res.redirect('/admin/builder');
  res.render('admin/builder-time', { error: null });
});

router.post('/admin/builder/time', requireAdmin, parseForm, (req, res) => {
  if (builderDraft.sectionsList().length === 0) return res.redirect('/admin/builder');

  let minutes = parseInt(req.body.minutes === 'other' ? req.body.customMinutes : req.body.minutes, 10);
  if (!minutes || minutes <= 0) {
    return res.render('admin/builder-time', { error: 'Enter a valid number of minutes.' });
  }

  const composedDraft = {
    timeLimitMinutes: minutes,
    sections: builderDraft.sectionsList().map((sec) => ({ number: sec.number, count: sec.count })),
  };

  const id = composePaper(composedDraft);
  builderDraft.reset();
  res.redirect('/admin/preview/' + id);
});

// ---------- Start over ----------

router.post('/admin/builder/reset', requireAdmin, (_req, res) => {
  builderDraft.reset();
  res.redirect('/admin/builder');
});

module.exports = router;
