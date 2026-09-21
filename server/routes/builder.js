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

// ---------- Step 3: strictly section-by-section prompt -> paste -> parse -> preview -> review ----------
//
// Only sections with New > 0 (TEACHER_WORKFLOW.md §4/§5) take part in this
// sequence, in ascending section-number order. The Teacher works through
// them one page at a time; approving a section's last needed item advances
// to the next one in the sequence automatically. Going back is always
// allowed (an already-resolved section just shows what was approved,
// read-only, plus a way forward again).

function generateSequence() {
  return builderDraft.sectionsList().filter((sec) => (sec.newCount || 0) > 0);
}

function isSectionResolved(sec) {
  return sec.approvedItems.length >= sec.newCount;
}

function sectionsProgress(seq) {
  return { done: seq.filter(isSectionResolved).length, total: seq.length };
}

/** Entry point: sends the Teacher to wherever they should be — the first
 * unresolved section, or straight to the time-limit step if none of the
 * selected sections need any new items at all. */
router.get('/admin/builder/generate', requireAdmin, (_req, res) => {
  const seq = generateSequence();
  if (seq.length === 0) return res.redirect('/admin/builder/time');
  const target = seq.find((sec) => !isSectionResolved(sec)) || seq[0];
  res.redirect('/admin/builder/generate/' + target.number);
});

router.get('/admin/builder/generate/:n', requireAdmin, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const seq = generateSequence();
  const idx = seq.findIndex((sec) => sec.number === n);
  if (idx === -1) return res.redirect('/admin/builder/generate');

  const sec = seq[idx];
  const summaryMap = sectionSummaryMap();
  const remaining = Math.max(0, sec.newCount - sec.approvedItems.length);
  const resolved = remaining <= 0;

  res.render('admin/builder-generate', {
    progress: Object.assign({ position: idx + 1 }, sectionsProgress(seq)),
    section: {
      number: n,
      title: (summaryMap[n] || {}).title || '',
      newCount: sec.newCount,
      approvedCount: sec.approvedItems.length,
      approvedItems: sec.approvedItems,
      remaining,
      resolved,
      prompt: remaining > 0 ? buildPrompt(n, remaining) : null,
      pending: builderDraft.getPending(n),
    },
    prevNumber: idx > 0 ? seq[idx - 1].number : null,
    nextNumber: resolved && idx < seq.length - 1 ? seq[idx + 1].number : null,
    isLastSection: idx === seq.length - 1,
  });
});

router.post('/admin/builder/generate/:n/parse', requireAdmin, parseForm, (req, res) => {
  const n = parseInt(req.params.n, 10);
  const entry = builderDraft.getDraft().sections[n];
  if (!entry) return res.redirect('/admin/builder/generate');

  const remaining = Math.max(0, entry.newCount - entry.approvedItems.length);
  const optionCount = inferOptionCount(n);
  const pasted = req.body.pasted || '';
  const result = parseGenAiReply(pasted, { expectedCount: remaining, expectedOptionCount: optionCount });

  // Keep the raw pasted text alongside the parse result so the Teacher can
  // still see exactly what they pasted next to what came out of it.
  builderDraft.setPending(n, Object.assign({ raw: pasted }, result));
  res.redirect('/admin/builder/generate/' + n);
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
    builderDraft.setPending(n, { raw: pending.raw, items: pending.items, errors });
    return res.redirect('/admin/builder/generate/' + n);
  }

  if (approvedRaw.length > 0) {
    const stamped = genaiApprovedStore.appendApprovedItems(n, approvedRaw, GENAI_APPROVED_DIR);
    builderDraft.recordApproved(n, stamped);
  } else {
    builderDraft.clearPending(n);
  }

  // Not fully resolved yet (e.g. a partial approval, or nothing was
  // checked) — stay on this section so the Teacher can paste more.
  if (!isSectionResolved(builderDraft.getDraft().sections[n])) {
    return res.redirect('/admin/builder/generate/' + n);
  }

  // Resolved: move on — to the next section in the sequence, or to the
  // time-limit step if this was the last one.
  const seq = generateSequence();
  const idx = seq.findIndex((sec) => sec.number === n);
  const next = seq[idx + 1];
  res.redirect(next ? '/admin/builder/generate/' + next.number : '/admin/builder/time');
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
