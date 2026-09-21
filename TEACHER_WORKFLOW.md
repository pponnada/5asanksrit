# Teacher Workflow — Building a Question Paper (Requirements)

**Persona: Teacher only.** This document replaces the previous version of
`TEACHER_WORKFLOW.md`, which described a workflow driven by an AI coding
agent (Claude Code or similar) sitting in a terminal with the Teacher. That
workflow is **retired**. Paper building now happens entirely inside the
running web app, in the existing PIN-gated admin area — no coding agent, no
terminal, no chat-with-an-agent round trips.

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
`/admin/preview/:id`, etc. — see `server/routes/admin.js`). A new entry
point, e.g. **"Build New Paper"**, on the admin dashboard leads into this
flow (suggested route: `/admin/builder`).

The flow is a **wizard with independently revisitable steps** — the Teacher
should be able to jump back to an earlier section (e.g. to add more
questions to a section they thought they were done with) without losing
progress already made on other sections. It is not required to be strictly
linear top-to-bottom the way the old chat-based workflow was.

## 2. Step 1 — Select sections

A single screen listing all 18 sections of `qa-corpus.md` (विभागः 1–18) as
checkboxes/multi-select. Each row shows, so the Teacher never has to type or
recall a section name:

- Section number
- Devanagari title **and** English title (both — unlike the old chat
  workflow, a browser renders Devanagari fine, so there's no reason to hide
  it here)
- **Native usable count** — native items in that section with
  `Status: Confirmed` **and** an existing `विकल्पाः:` line (see §9 of
  `REQUIREMENTS.md` — "usable items" is an established rule, unchanged here)
- **Existing GenAI-approved count** — items already sitting in that
  section's approved pool (§8 below) from a previous session

The Teacher checks whichever sections they want in this paper.

## 3. Step 2 — Question count per selected section

For each checked section, ask how many questions to draw from it (a plain
numeric input is fine now that this is a real form, not a chat picker — no
need to fake multiple-choice presets the way the old `AskUserQuestion`-based
workflow did). `0` removes the section from the paper.

## 4. Step 3 — Existing vs. new split (skipped for Meanings)

For **every selected section except विभागः 1 (Meanings)**, once its count
`N` is set, ask the Teacher to split `N` into:

- **Existing** — drawn from the combined pool of native usable items +
  already-approved GenAI items for that section (§2's two counts, summed).
  The UI caps this field at that combined total — it cannot exceed what
  actually exists — but the Teacher is free to enter **less** than the max
  (e.g. to force more fresh variety into the paper even when older
  questions would technically suffice).
- **New** — the remainder (`N` − Existing), which must be produced by the
  prompt → paste → parse → review loop in §5–§7 before the section counts as
  resolved.

**Hard rule — विभागः 1 (Meanings) is always corpus-only, no exceptions.**
This step is not shown for it: its entire count `N` is implicitly
"Existing," always sourced from `qa-corpus.md` alone, and it never gets a
prompt/paste UI (§5). No GenAI-approved pool is ever created for Meanings.
This preserves the existing rule that Meanings — the vocabulary foundation
everything else depends on — is never GenAI-generated.

## 5. Step 4 — Prompt → Copy → Paste → Parse → Preview → Review

Shown once per selected non-Meanings section whose "New" count (§4) is
greater than 0. Each section gets its own self-contained block on the page:

1. **A collapsed prompt panel**, specific to this section, generated from a
   template (§6) filled in with this section's context. Collapsed by
   default so the page stays scannable when several sections need new
   questions; expandable to read in full.
2. **A "Copy Prompt" button** that copies the complete, filled-in prompt
   text to the clipboard, ready to paste into whatever web chat LLM the
   Teacher is using (ChatGPT, Google AI Mode, or anything else — the prompt
   makes no assumptions about which one).
3. Below that, a **paste textarea** — the Teacher pastes the LLM's full
   reply here.
4. A **"Parse" action** that runs the response through the parser (§7) and
   shows either:
   - a **preview** of the successfully parsed candidate questions
     (rendered the same way a question looks to a Student — stem, options,
     marked correct answer, note), or
   - a clear **error** naming what's wrong (§7) so the Teacher can either
     fix the pasted text by hand or go back to the LLM chat and ask it to
     correct its answer, then paste again.
5. A **review step** on the preview: the Teacher can, per candidate item,
   **approve**, **edit** (stem/options/answer/note, re-validated the same
   way as §7), or **reject** it. Only approved items are persisted (§8).
   Paste → Parse → Preview → Review can be repeated as many times as needed
   for a section (e.g. if some items are rejected and the Teacher wants to
   generate replacements) until enough approved items exist to satisfy that
   section's "New" count.

A section is **resolved** once (approved Existing selection) + (approved New
items) together equal its requested count `N`. The wizard should visibly
track this per section (e.g. "6 / 8 resolved") and only allow moving on to
§10 (time limit) once every selected section is resolved.

## 6. Prompt template contents

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
- **Style context**, assembled automatically from `qa-corpus.md` (and, if
  any exist, the section's own `genai-approved/vibhaga-<NN>.json`, §8):
  - Every native item currently in that section (all of them — sections
    other than Meanings are small; none needs sampling/truncation), shown
    as stem + answer + note where present, **even for items that don't
    have a `विकल्पाः:` line** — those still convey the exact vocabulary,
    verb forms, and phrasing this section drills, which the new items must
    match.
  - Every existing GenAI-approved item for that section, if any, shown in
    full (stem + options + answer + note) — these are the closest possible
    style template since they're already in the target MCQ shape.
- The **exact number of new items requested** (the section's "New" count
  from §4).
- An explicit instruction to avoid duplicating the stems already shown as
  context.
- An explicit, unambiguous **output format specification** (§7) — including
  a worked example of exactly one item in that format — and an instruction
  to reply with **only** that output, no explanatory prose before or after.

## 7. Expected output format & parsing

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
  §6 showed, not hard-code "4" globally).
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
- If the returned count doesn't match the requested "New" count from §4,
  say so explicitly (e.g. "asked for 5, got 3") rather than silently
  under/over-filling — the Teacher decides whether to accept what parsed,
  reject and re-prompt, or top up with another paste.

## 8. Persisted storage for GenAI-approved items

Approved items (§5 review step) are persisted per section, same directory
as today (`genai-approved/`), but as **JSON instead of Markdown** — chosen
because the item was already validated as JSON in §7 and re-serializing
through Markdown and back would be pure overhead with no benefit:

**`genai-approved/vibhaga-<NN>.json`** — one file per section that has any
approved items (created on first approval; a section with none simply has
no file, same "absence means don't consult it" convention as today). An
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

Field meanings are unchanged from the old Markdown format — same
`G<NN>-<seq>` ID scheme (so IDs stay visually distinct from native `Qxxx`
IDs and never collide with future corpus additions), same
`sourceSection`/`approved` metadata. Only the file encoding changes.

**Migration note:** sections that already have a `genai-approved/vibhaga-
<NN>.md` file from the old workflow (currently वि. 2–13, 17–26) need a
one-time conversion to the new `.json` shape before this new builder can see
them as "existing" pool items (§4) — otherwise those pools would silently
appear empty. This conversion is a prerequisite implementation step, not
optional cleanup.

`qa-corpus.md` itself and `papers/<id>.md` are **unchanged** — this format
switch is scoped to the GenAI-approved pool only.

## 9. Step 5 — Exam time limit

Once every selected section is resolved (§5), ask for a single total time
limit for the whole paper (there is no per-question or per-section timer).
Offer common presets (15 / 20 / 30 / 45 minutes) plus a custom value.

## 10. Step 6 — Compose the paper

An explicit "Compose Paper" action, enabled once every section is resolved
and a time limit is set. This performs the exact same composition the old
workflow's step 6 did — **unchanged**:

- For each section, pick the exact item set: the chosen number of
  **Existing** items via a random sample without replacement from the
  applicable pool(s), plus every approved **New** item from §5.
- Fix the final order.
- Write `papers/<id>.md` in the existing format (`REQUIREMENTS.md` §5),
  with no `Published-At:` yet — i.e. a **Draft**.

## 11. Handoff to existing preview/publish — unchanged

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

## 12. What's removed

- The AI-coding-agent-driven conversational workflow (the old
  `AskUserQuestion`-batched section walkthrough, the free-text
  drafting-and-approval chat loop, the "Devanagari doesn't render well in
  some agent TUIs" workaround) is gone entirely. It is not a fallback or an
  alternate path — the web builder above is the only paper-generation path
  going forward.
- No coding agent (Claude Code, opencode, or otherwise) needs read/write
  access to this repository to build a paper anymore.

`REQUIREMENTS.md` §1/§3/§5/§6/§7/§9/§12/§13 have been updated to match this
document.
