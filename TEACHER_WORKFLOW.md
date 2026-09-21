# Teacher Workflow — Question Bank & Building a Question Paper (Requirements)

**Persona: Teacher only.** This document replaces the previous version of
`TEACHER_WORKFLOW.md`, which described a workflow driven by an AI coding
agent (Claude Code or similar) sitting in a terminal with the Teacher. That
workflow is **retired**. Paper building now happens entirely inside the
running web app, in the existing PIN-gated admin area — no coding agent, no
terminal, no chat-with-an-agent round trips.

**This version also splits question-bank growth out of paper building.**
Earlier, generating new GenAI questions for a section only happened inline,
tied to whatever paper the Teacher was currently composing. Now it's its
own standalone area — **Manage Question Bank** (§2) — reached from the
dashboard independently of any specific paper. By the time the Teacher
builds a paper (§3), every selected section's count is simply a draw
against what's already banked; there's no more prompt/paste loop inside
the paper-building wizard itself.

The only AI involved anywhere in this workflow is a **general-purpose web
chat LLM the Teacher already has separate access to** (e.g. ChatGPT, Google
AI Mode) — the app never calls an LLM itself. This carries forward the
existing hard rule that **the running server never makes an LLM API call**
(no API key to manage, no runtime dependency on an LLM vendor). The Teacher
copies a prompt out of the app, pastes it into whatever web chat tool they
like, copies the reply back, and pastes it into the app, which parses it.

## 1. Where this lives

Everything below is a new area inside the **existing PIN-gated `/admin`**
surface (same session/PIN auth as today's `/admin/dashboard`,
`/admin/preview/:id`, etc. — see `server/routes/admin.js`). Two entry
points on the admin dashboard lead into it:

- **"Manage Question Bank"** (suggested route: `/admin/bank`) — §2 below.
- **"Build New Paper"** (suggested route: `/admin/builder`) — §3 below.

They are independent flows. A Teacher can grow a section's bank at any
time, with no paper in progress; a Teacher building a paper never leaves
that wizard to generate new questions — if a section's bank is too small,
they go add to it via §2 first, then come back.

## 2. Manage Question Bank

### 2.1 Section list

A single screen (`/admin/bank`) listing all 18 sections of `qa-corpus.md`
(विभागः 1–18), each row showing:

- Section number, Devanagari title, and English title.
- **Native usable count** — native items in that section with
  `Status: Confirmed` **and** an existing `विकल्पाः:` line (see §4 of
  `REQUIREMENTS.md` — "usable items" is an established rule, unchanged
  here).
- **Existing GenAI-approved count** — items already sitting in that
  section's approved pool (§2.3 below).
- A **"Manage"** link into that section's own page (§2.2) — except for
  विभागः 1 (Meanings), which shows a **"Corpus only"** note instead and has
  no add-to-bank link at all (see the hard rule below).

**Hard rule — विभागः 1 (Meanings) is always corpus-only, no exceptions.**
Its bank is just its native `qa-corpus.md` items, always. It never gets a
prompt/paste UI, and no `genai-approved/vibhaga-01.json` is ever created.
This preserves the existing rule that Meanings — the vocabulary foundation
everything else depends on — is never GenAI-generated.

### 2.2 Per-section bank page

`/admin/bank/:n` for a non-Meanings section shows:

1. **What's already banked** — the native usable count, plus every
   GenAI-approved item currently in the pool (id, stem, answer), so the
   Teacher can see exactly what a paper could draw from this section right
   now.
2. **"How many new questions to generate?"** — a plain numeric input. This
   starts a generation round for an arbitrary count the Teacher chooses
   (not tied to any paper's requested count).
3. Once a round is started, the same **prompt → copy → paste → parse →
   preview → review** loop as before (§4):
   - A **collapsed-by-default prompt panel**, filled in from the template
     (§5) with this section's context and the requested count.
   - A **"Copy Prompt" button**.
   - A **paste textarea** for the LLM's reply, and a **"Parse"** action
     (§6).
   - A **review step**: approve, edit, or reject each candidate item.
     Approved items are appended immediately to the section's pool (§2.3);
     rejected ones are simply dropped.
4. After a round finishes (all candidates approved or rejected), the
   Teacher is back at step 2 — free to start another round, request a
   different count, or leave the page. There's no fixed target to reach;
   the bank simply grows by however much the Teacher chooses to add, over
   as many sessions as they like.

### 2.3 Persisted storage for GenAI-approved items

Approved items (§2.2 step 3) are persisted per section as
**`genai-approved/vibhaga-<NN>.json`** — one file per section that has any
approved items (created on first approval; a section with none simply has
no file, same "absence means don't consult it" convention as elsewhere). An
array of item objects:

```json
[
  {
    "id": "G09-007",
    "stem": "त्वम् ______________ । (हस्)",
    "options": ["हससि", "वदामः", "कूर्दामि", "चलथ"],
    "answer": "हससि",
    "status": "Confirmed",
    "note": "मध्यमपुरुष-एकवचनस्य रूपम्।",
    "sourceSection": "विभागः 9",
    "approved": "2026-09-21"
  }
]
```

Same `G<NN>-<seq>` ID scheme as before (so IDs stay visually distinct from
native `Qxxx` IDs and never collide with future corpus additions), same
`sourceSection`/`approved` metadata. `qa-corpus.md` itself and
`papers/<id>.md` are **unchanged** — this JSON format is scoped to the
GenAI-approved pool only.

## 3. Build New Paper

The flow is a **wizard with independently revisitable steps** — the
Teacher can jump back to an earlier step without losing progress on later
ones. There is no per-section prompt/paste loop here anymore — see §2.

### 3.1 Step 1 — Select sections and counts, from the bank

A single screen listing all 18 sections as checkboxes/multi-select, each
row showing the same section identity + native/GenAI-approved counts as
§2.1, plus **how many total are banked** (native usable + GenAI-approved
summed).

For each checked section, the Teacher enters how many questions to draw
from it. `0` (or unchecked) removes the section from the paper. **The
count is capped at that section's total banked count** — it cannot exceed
what's actually there. If the Teacher wants more than the bank currently
holds, they go grow that section's bank first (§2), then come back.

**विभागः 1 (Meanings)** works the same way here as every other section for
this step — its "bank" is just its native items (§2.1), and its count is
capped at that native count.

### 3.2 Step 2 — Exam time limit

Once every selected section has a valid count, ask for a single total time
limit for the whole paper (there is no per-question or per-section timer).
Offer common presets (15 / 20 / 30 / 45 minutes) plus a custom value.

### 3.3 Step 3 — Compose the paper

An explicit "Compose Paper" action, enabled once a time limit is set. For
each selected section, in ascending section-number order: a **random
sample without replacement**, sized to that section's requested count,
drawn from native-usable ∪ GenAI-approved for that section (its bank, §2).
Fix the final order, and write `papers/<id>.md` in the existing format
(`REQUIREMENTS.md` §5), with no `Published-At:` yet — i.e. a **Draft**.

## 4. Prompt → Copy → Paste → Parse → Preview → Review (§2.2 step 3, detail)

1. **A collapsed prompt panel**, specific to the section and the requested
   count, generated from a template (§5) filled in with that section's
   context. Collapsed by default; expandable to read in full.
2. **A "Copy Prompt" button** that copies the complete, filled-in prompt
   text to the clipboard, ready to paste into whatever web chat LLM the
   Teacher is using (ChatGPT, Google AI Mode, or anything else — the prompt
   makes no assumptions about which one).
3. Below that, a **paste textarea** — the Teacher pastes the LLM's full
   reply here.
4. A **"Parse" action** that runs the response through the parser (§6) and
   shows either:
   - a **preview** of the successfully parsed candidate questions
     (rendered the same way a question looks to a Student — stem, options,
     marked correct answer, note), or
   - a clear **error** naming what's wrong (§6) so the Teacher can either
     fix the pasted text by hand or go back to the LLM chat and ask it to
     correct its answer, then paste again.
5. A **review step** on the preview: the Teacher can, per candidate item,
   **approve**, **edit** (stem/options/answer/note, re-validated the same
   way as §6), or **reject** it. Only approved items are persisted (§2.3).
   Paste → Parse → Preview → Review can be repeated as many times as the
   Teacher likes for a section (e.g. if some items are rejected and the
   Teacher wants to generate replacements, or they simply want to add
   another batch later).

## 5. Prompt template contents

The template is filled in per section and must make the LLM's task and the
expected reply shape unambiguous, since the reply is hand-pasted from an
arbitrary web chat tool with no guaranteed formatting discipline. It must
include:

- The section's number, Devanagari title, and English title.
- A plain-language description of this paper's audience: a single Student,
  roughly 5th-grade level, learning Sanskrit; every question must be
  presented as multiple choice (no free-text/handwriting), because typing
  Devanagari on a tablet is impractical for the age group (carries forward
  the existing hard rule in `REQUIREMENTS.md` §4).
- **Source material**, verbatim, for any section that has it — e.g. विभागः
  5's poems, or विभागः 7/17's मञ्जूषा word banks: free text `qa-corpus.md`
  carries for that section outside of any item block (before, between, or
  after item blocks — विभागः 5's alphabet poem, for instance, sits between
  two item blocks, not just before the first one). Included **in full**,
  with an explicit instruction that it is the **only** material new items
  may draw on: for a poem, every new item's answer must be an actual
  line/phrase copied from it, never invented; for a word bank, the answer
  must be one of the given words. A section with no such text (most
  sections) omits this block entirely — nothing changes for them.
- **Style context**, assembled automatically from `qa-corpus.md` (and, if
  any exist, the section's own `genai-approved/vibhaga-<NN>.json`, §2.3):
  - Every native item currently in that section (all of them — sections
    other than Meanings are small; none needs sampling/truncation), shown
    as stem + answer + note where present, **even for items that don't
    have a `विकल्पाः:` line** — those still convey the exact vocabulary,
    verb forms, and phrasing this section drills, which the new items must
    match.
  - Every existing GenAI-approved item for that section, if any, shown in
    full (stem + options + answer + note) — these are the closest possible
    style template since they're already in the target MCQ shape.
- The **exact number of new items requested** (the count the Teacher chose
  in §2.2 step 2).
- An explicit instruction to avoid duplicating the stems already shown as
  context.
- An explicit, unambiguous **output format specification** (§6) — including
  a worked example of exactly one item in that format — and an instruction
  to reply with **only** that output, no explanatory prose before or after.

## 6. Expected output format & parsing

The LLM is asked to reply with a **JSON array**, one object per requested
item, shaped as:

```json
[
  {
    "stem": "त्वम् ______________ । (हस्)",
    "options": ["हससि", "वदामः", "कूर्दामि", "चलथ"],
    "answer": "हससि",
    "note": "मध्यमपुरुष-एकवचनस्य रूपम्।"
  }
]
```

- `stem` — the question text (required, non-empty).
- `options` — the multiple-choice options, matching the option count this
  section's existing items use (every section observed today uses 4;
  the parser should accept whatever count the section's own examples in
  §5 showed, not hard-code "4" globally).
- `answer` — required; must exactly match one of `options` (trimmed
  whitespace comparison, exact text otherwise — Devanagari has no
  meaningful case-folding to fall back on).
- `note` — optional explanation string, carried through unchanged if
  present.

JSON (over the corpus's native Markdown item-block shape) was chosen because
it is far more reliable to parse out of arbitrary, hand-pasted web-chat
output — no ambiguity about line wrapping, delimiters, or field order.

**Parsing must tolerate common LLM formatting habits**, since the Teacher
cannot fix the LLM's output style, only re-paste or re-prompt:

- Strip surrounding ```` ```json ... ``` ```` or ```` ``` ... ``` ```` code
  fences if present.
- If the whole pasted text isn't valid JSON on its own (e.g. the LLM added
  a sentence before/after the array), locate the outermost `[` … `]` and
  parse that substring.
- If parsing still fails, or the result isn't an array, surface a clear
  error rather than a stack trace or a blank preview.

**Per-item validation**, reported per item so the Teacher can see exactly
which of the pasted items is the problem, not just "parse failed":

- `stem` present and non-empty.
- `options` is a list of strings, all non-empty, no duplicates.
- `answer` present and exactly matches one entry in `options`.
- If the returned count doesn't match the requested count from §2.2 step 2,
  say so explicitly (e.g. "asked for 5, got 3") rather than silently
  under/over-filling — the Teacher decides whether to accept what parsed,
  reject and re-prompt, or top up with another paste.

## 7. Handoff to existing preview/publish — unchanged

Everything after composition is **already a web page today and needs no
change**:

- The new Draft shows up on `/admin/dashboard` like any other paper, with a
  **Preview** action (`/admin/preview/:id`) for proofreading — same
  answers-shown, no-timer render as today.
- Publishing is the existing **"Make latest"** action
  (`/admin/make-latest/:id`), which stamps `Published-At:` (if not already
  set) and repoints `papers/latest.txt` — exactly as today. No separate
  "publish" step needs to be added to the new builder; it hands off to the
  dashboard the same way a manually-edited paper file would.

## 8. What's removed

- The AI-coding-agent-driven conversational workflow (the old
  `AskUserQuestion`-batched section walkthrough, the free-text
  drafting-and-approval chat loop, the "Devanagari doesn't render well in
  some agent TUIs" workaround) is gone entirely. It is not a fallback or an
  alternate path — the web app above is the only paper-generation path
  going forward.
- No coding agent (Claude Code, opencode, or otherwise) needs read/write
  access to this repository to build a paper anymore.
- The inline "Existing vs. New split" step and the inline prompt/paste
  loop **inside the paper-building wizard** are gone — growing a section's
  bank is now always §2, done separately from building any specific paper.

`REQUIREMENTS.md` §3/§5/§6/§7/§9/§12/§13 have been updated to match this
document.
