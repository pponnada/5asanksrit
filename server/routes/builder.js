const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const sectionSummary = require('../content/sectionSummary');
const genaiApprovedStore = require('../content/genaiApprovedStore');
const builderDraft = require('../content/builderDraft');
const { buildPrompt, inferOptionCount } = require('../content/buildPrompt');
const { parseGenAiReply, validateItem } = require('../content/parseGenAiReply');
const { composePaper } = require('../content/composePaper');
const { GENAI_APPROVED_DIR } = require('../config');

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

function sectionSummaryMap() {
  const map = {};
  sectionSummary.listSections().forEach((s) => {
    map[s.number] = s;
  });
  return map;
}

// ---------- Step 1: select sections + counts ----------

router.get('/admin/builder', requireAdmin, (_req, res) => {
  const sections = sectionSummary.listSections();
  const draftSections = builderDraft.getDraft().sections;
  res.render('admin/builder-sections', {
    sections,
    selected: draftSections,
    error: null,
  });
});

router.post('/admin/builder/sections', requireAdmin, parseForm, (req, res) => {
  const sections = sectionSummary.listSections();
  const selected = [];

  sections.forEach((s) => {
    const checked = req.body['select_' + s.number];
    const countRaw = req.body['count_' + s.number];
    const count = parseInt(countRaw, 10);
    if (checked && count > 0) selected.push({ number: s.number, count });
  });

  if (selected.length === 0) {
    return res.render('admin/builder-sections', {
      sections,
      selected: {},
      error: 'Select at least one section and a question count for it.',
    });
  }

  builderDraft.setSections(selected);
  res.redirect('/admin/builder/split');
});

// ---------- Step 2: existing/new split (skipped for विभागः 1) ----------

router.get('/admin/builder/split', requireAdmin, (_req, res) => {
  const draftSections = builderDraft.sectionsList();
  if (draftSections.length === 0) return res.redirect('/admin/builder');

  const summaryMap = sectionSummaryMap();
  const rows = draftSections.map((sec) => {
    const summary = summaryMap[sec.number] || { title: '', nativeUsableCount: 0, genaiApprovedCount: 0 };
    const available = summary.nativeUsableCount + summary.genaiApprovedCount;
    const isMeanings = sec.number === 1;
    return {
      number: sec.number,
      title: summary.title,
      count: sec.count,
      available,
      isMeanings,
      existing: isMeanings ? sec.count : Math.min(sec.existing || sec.count, available, sec.count),
    };
  });

  res.render('admin/builder-split', { rows, error: null });
});

router.post('/admin/builder/split', requireAdmin, parseForm, (req, res) => {
  const draftSections = builderDraft.sectionsList();
  const summaryMap = sectionSummaryMap();

  for (const sec of draftSections) {
    if (sec.number === 1) {
      builderDraft.setSplit(sec.number, sec.count, 0);
      continue;
    }
    const summary = summaryMap[sec.number] || { nativeUsableCount: 0, genaiApprovedCount: 0 };
    const available = summary.nativeUsableCount + summary.genaiApprovedCount;
    let existing = parseInt(req.body['existing_' + sec.number], 10);
    if (Number.isNaN(existing)) existing = 0;
    existing = Math.max(0, Math.min(existing, available, sec.count));
    const newCount = sec.count - existing;
    builderDraft.setSplit(sec.number, existing, newCount);
  }

  res.redirect('/admin/builder/generate');
});

// ---------- Step 3: per-section prompt -> paste -> parse -> preview -> review ----------

function buildGenerateBlocks() {
  const summaryMap = sectionSummaryMap();
  return builderDraft
    .sectionsList()
    .filter((sec) => (sec.newCount || 0) > 0)
    .map((sec) => {
      const remaining = sec.newCount - sec.approvedItems.length;
      const pending = builderDraft.getPending(sec.number);
      return {
        number: sec.number,
        title: (summaryMap[sec.number] || {}).title || '',
        newCount: sec.newCount,
        approvedCount: sec.approvedItems.length,
        remaining: Math.max(0, remaining),
        resolved: remaining <= 0,
        prompt: remaining > 0 ? buildPrompt(sec.number, remaining) : null,
        pending,
      };
    });
}

router.get('/admin/builder/generate', requireAdmin, (_req, res) => {
  res.render('admin/builder-generate', {
    blocks: buildGenerateBlocks(),
    allResolved: builderDraft.isFullyResolved(),
  });
});

router.post('/admin/builder/generate/:n/parse', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const entry = builderDraft.getDraft().sections[n];
  if (!entry) return res.redirect('/admin/builder/generate');

  const remaining = Math.max(0, entry.newCount - entry.approvedItems.length);
  const optionCount = inferOptionCount(n);
  const result = parseGenAiReply(req.body.pasted, { expectedCount: remaining, expectedOptionCount: optionCount });

  builderDraft.setPending(n, result);
  res.redirect('/admin/builder/generate#section-' + n);
});

router.post('/admin/builder/generate/:n/approve', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const entry = builderDraft.getDraft().sections[n];
  const pending = builderDraft.getPending(n);
  if (!entry || !pending) return res.redirect('/admin/builder/generate');

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
    builderDraft.setPending(n, { items: pending.items, errors });
    return res.redirect('/admin/builder/generate#section-' + n);
  }

  if (approvedRaw.length > 0) {
    const stamped = genaiApprovedStore.appendApprovedItems(n, approvedRaw, GENAI_APPROVED_DIR);
    builderDraft.recordApproved(n, stamped);
  } else {
    builderDraft.clearPending(n);
  }

  res.redirect('/admin/builder/generate#section-' + n);
});

// ---------- Step 4: time limit, then compose ----------

router.get('/admin/builder/time', requireAdmin, (_req, res) => {
  if (!builderDraft.isFullyResolved()) return res.redirect('/admin/builder/generate');
  res.render('admin/builder-time', { error: null });
});

router.post('/admin/builder/time', requireAdmin, parseForm, (req, res) => {
  if (!builderDraft.isFullyResolved()) return res.redirect('/admin/builder/generate');

  let minutes = parseInt(req.body.minutes === 'other' ? req.body.customMinutes : req.body.minutes, 10);
  if (!minutes || minutes <= 0) {
    return res.render('admin/builder-time', { error: 'Enter a valid number of minutes.' });
  }

  const composedDraft = {
    timeLimitMinutes: minutes,
    sections: builderDraft.sectionsList().map((sec) => ({
      number: sec.number,
      existing: sec.existing,
      approvedItems: sec.approvedItems,
    })),
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
