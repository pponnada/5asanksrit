# Requirements — Sanskrit Practice & Testing Web App

Status: **Draft v5 — reviewed, no open questions left.** Ready to turn into
an implementation plan.

## 1. Purpose

A LAN-only web application that turns the content in `qa-corpus.md` into
practice/test material for a child learning Sanskrit (5th grade level). Two
personas use it:

- **Teacher**: generates question papers through a fast, conversational
  workflow **inside a Claude session** (§6) — not a form-filling admin UI —
  and, in the running app, reaches a PIN-gated area to review results.
- **Student**: a single, fixed Student (no accounts) opens a known URL,
  taps **"Take Test"** to start the latest published paper, answers under a
  timer, and afterward reviews the paper with correct answers and
  explanations. Older papers the Student hasn't taken yet remain reachable
  and takeable via a secondary link; completed ones remain reviewable there
  too.

## 2. Source content model

- `qa-corpus.md` is organized into **sections** (`विभागः 1`, `विभागः 2`, ...).
  Each section is the **base unit** the Teacher picks from — a "topic."
- Each section contains zero or more **items**, each with: a global ID
  (`Qxxx`), a question stem, the correct answer, a `Status` flag, and
  optionally a `Note` (explanation / grammar rationale).
- Only `Status: Confirmed` items are usable as-is. Items marked
  `Status: Needs Teacher Input` must not be served to a Student until a
  Teacher resolves them.
- The app must ingest `qa-corpus.md` (and the files in §5) into a
  structured store (not read Markdown live at request time), so
  sections/items get stable IDs the rest of the system can reference.
- विभागः 1 (शब्दार्थाः / Meanings) is fully converted: 162 MCQ items
  (Q131–Q292), one per unique vocabulary word, each with the correct Hindi
  meaning plus 3 same-category distractors. See §4 for a hard rule specific
  to this section.

## 3. Question sourcing: native vs. GenAI-approved

Every question the app can ever serve comes from one of two **pre-persisted**
pools — the running app never calls an LLM at runtime:

1. **Native items** — taken directly from a section in `qa-corpus.md`.
2. **GenAI-approved items** — questions modeled on a section's style,
   drafted and approved one-by-one through the §6 workflow, stored
   **separately** from the native corpus (§5) precisely so that a paper
   can be composed from native content alone by simply disregarding the
   GenAI file(s) — no filtering logic needed to exclude "the GenAI ones,"
   just don't read that file.

When generating a paper, for each selected section the workflow (or,
someday, an in-app builder) picks a **source mix**:
- *Corpus only* — draw only from native `Confirmed` items in that section
  (i.e. `qa-corpus.md` alone; the section's GenAI-approved file, if any, is
  simply not consulted).
- *Corpus + GenAI-approved* — draw from both the native section and its
  GenAI-approved file(s).

**Hard rule:** विभागः 1 (Meanings) is **always corpus-only**, regardless of
what's requested elsewhere in the same paper — meaning questions must never
be GenAI-generated, since they anchor everything else. No GenAI-approved
file should ever be created for विभागः 1.

If a section's applicable pool doesn't have enough `Confirmed`/approved
items to satisfy the requested count, this must surface as an explicit gap
(§6 step 2) rather than silently under-filling.

## 4. All questions are multiple choice

Because typing Devanagari in a browser is impractical for a 10-year-old,
**every question presented to the Student is multiple choice** — no free-text
or handwriting input anywhere in the Student flow.

- Sections that already encode options in `qa-corpus.md` (e.g. विभागः 14–16,
  which have `विकल्पाः: ...`) use those options directly.
- Sections that are fill-in-the-blank, translation, or open-answer in the
  corpus have no native distractors for their non-meaning items — those
  must come from the §6 drafting-and-approval workflow before an item can
  be shown to a Student.
- विभागः 1 (Meanings) is already fully MCQ-ready natively (§2) — no GenAI
  distractor generation applies there, consistent with the §3 hard rule.
- Distractor sets, once approved, are persisted and never regenerated per
  request, so a given question's options are stable across a paper's
  lifetime, including during Student review after submission.

## 5. File & folder conventions

Concrete artifacts the §6 workflow reads and writes, all plain Markdown so
they're easy for a Claude session to work with directly and easy for the
app's ingestion step (§2) to parse:

- **`qa-corpus.md`** (existing) — native corpus, unchanged format.
- **`genai-approved/vibhaga-<NN>.md`** — one file per section that has any
  GenAI-approved items (created on first use; a section with none simply
  has no file, which is what makes "disregard the GenAI items" trivial —
  §3). Same per-item shape as `qa-corpus.md` (stem / options / answer /
  status / note), but IDs use a `G<NN>-<seq>` scheme (e.g. `G09-001`) so
  they're visually distinct from native `Qxxx` IDs and never collide with
  future additions to the native corpus. Each item also carries
  `Source-Section:` and `Approved:` (date) metadata.
- **`papers/<id>.md`** — one file per *composed* paper (`id` e.g.
  `2026-09-20-1904`), published or not. Header block with sections tested,
  per-section source-mix and count, total time limit, a composed timestamp,
  and a `Published-At:` field that's **absent until §6 step 9 actually
  publishes it** (that absence is what marks a paper "Draft" on the
  dashboard, §7). Body is the resolved, fixed-order question list (with the
  correct option marked and the explanation carried along) — this is the
  exact content the running app serves for that paper, whether to the
  Teacher's preview (§6 step 8, §7) or, once published, to the Student.
- **`papers/latest.txt`** — single line naming the currently-latest paper's
  `id`. Updated by the §6 workflow on publish (which also sets that paper's
  `Published-At:`). The running app reads this to know what "Take Test"
  opens. Only papers with `Published-At:` set are ever shown to the
  Student (§8) — a Draft is visible solely on the Teacher dashboard (§7)
  until it's published or abandoned.

## 6. Teacher paper-generation workflow (inside Claude)

There is **no in-app "generate questions" button and no LLM API call from
the running application** — the Teacher has no LLM API key to give it, and
this conversational workflow is also just faster than filling out a form.
Critically, it must **not require the Teacher to type or remember section
names** — with 26 sections in `qa-corpus.md`, that's an unreasonable ask.
Instead Claude drives a guided, mostly tap-not-type walkthrough:

1. **Walk through every section, asking count.** For each of the 26
   sections in order, Claude prompts for how many questions to draw from
   it, using a structured multiple-choice prompt (`AskUserQuestion`) —
   never a blank "type your answer" field. Each prompt shows enough for the
   Teacher to recognize the section without having memorized it: the
   Devanagari + English section title, and how many native items (and, if
   any, GenAI-approved items) currently exist for it. Options are `0
   (skip)` plus a few sensible presets (e.g. `3`, `5`, `8`, `10`); a custom
   number is always available via the picker's built-in "Other" option. To
   keep this from being 26 separate round-trips, Claude batches up to 4
   sections per `AskUserQuestion` call (its per-call limit), so the whole
   walkthrough is ~7 quick screens, not 26.
2. **Ask source mix, only for sections that got a non-zero count** (and
   skipping विभागः 1, which is always corpus-only per §3 — Claude states
   this rather than asking). Same batching approach: a multiple-choice
   prompt per section — *"Corpus only"* vs *"Corpus + GenAI-approved"* —
   grouped 4-at-a-time.
3. **Ask total time limit** for the whole paper, once, as a multiple-choice
   prompt with common presets (e.g. `15 min`, `20 min`, `30 min`, `45 min`)
   plus "Other" for a custom value.
4. **Checks pool sufficiency** per section against what was requested:
   counts `Status: Confirmed` native items, plus (for corpus+genai
   sections) items already sitting in that section's
   `genai-approved/vibhaga-<NN>.md`.
5. **Fast path**: if every requested (section, count) is already
   satisfiable from existing pools, skip straight to step 7 — no drafting,
   no review, just composition. This is the common case once a section's
   GenAI pool has been built up once.
6. **Slow path** (only for the shortfall, if any): Claude drafts the
   missing questions in one batch, modeled on that section's existing
   native items (style, difficulty, phrasing), each with a correct answer
   and distractors, and shows the whole batch to the Teacher **as readable
   Sanskrit text in the chat** — this step is inherently a reading/editing
   task, not a multiple-choice one, so free-form reply ("approve all",
   "drop #3", "change option B on #5 to...") is the right interface here,
   unlike steps 1–3. Claude loops back only on items that need rework.
   Approved items are appended to `genai-approved/vibhaga-<NN>.md` (§5), so
   the next paper needing that section hits the fast path instead.
7. **Composes a draft paper**: selects the exact question set per section
   (random sample without replacement from the applicable pool(s) per the
   chosen source mix), fixes the order, and writes `papers/<id>.md` (§5).
   This file existing does **not** publish it — `papers/latest.txt` is
   untouched until step 9.
8. **Hands the Teacher a preview URL**: something like
   `http://<lan-host>/admin/preview/<id>` (PIN-gated, same as §7), which
   renders the paper exactly as the Student would see each question —
   Devanagari layout, options, everything — but with the correct answer
   and explanation visibly shown under each question (§7) so the Teacher
   can proofread content and check the visual look in one pass, without
   needing a browser or faking a timed run. The Teacher opens this on
   their own device, then returns to the Claude session with either an
   OK or specific change requests; Claude edits `papers/<id>.md` directly
   and the same preview URL reflects the fix on reload — no new ID needed
   unless the underlying question set itself must be regenerated.
9. **Publishes only on explicit go-ahead**: once the Teacher confirms in
   the chat, Claude updates `papers/latest.txt` to point at this paper —
   which immediately becomes the "Take Test" target and moves the previous
   latest paper into the "other papers" list (§8), whether or not the
   Student ever took it.

Growing the GenAI-approved pool (step 6) can also be run on its own, ahead
of any specific paper, whenever the Teacher wants more variety banked for a
section — it doesn't have to happen inline with publishing.

## 7. Teacher workflow (in the running app)

Because paper *generation* happens in §6, the app's Teacher-facing surface
is intentionally thin: a PIN gate, then a single dashboard. No paper
creation/editing controls live here — that's Claude's job.

**PIN entry screen**: minimal and adult-oriented (unlike the Student UI, no
need to design for a 10-year-old here) — app name, a plain PIN input
(numeric keypad on touch devices), a submit action, and a simple error
state on a wrong PIN. Nothing else on this screen.

**Dashboard (after a correct PIN)**: one screen, a single list of every
paper in `papers/`, most recent first. Each row shows:

- Paper id/date and a one-line contents summary (e.g. *"5 sections · 24
  questions · 20 min"*).
- A status badge: **Latest** (what "Take Test" currently opens), **Draft**
  (composed via §6 step 7 but never published — i.e. not `latest.txt` and
  never was), **Taken** (with the score, e.g. *"18/24"*), or **Not taken**
  (published or draft, but the Student hasn't opened it).
- Row actions, only the ones that apply: **Preview** (§6 step 8's
  render-with-answers-shown view — available for any paper, published or
  not, so it doubles as both the pre-publish proofread and a permanent "what
  was actually asked" record), **View results** (only once Taken — full
  per-question breakdown: the Student's pick, the correct answer, whether
  it was right, and time taken), and, if a paper isn't already Latest,
  **Make latest** (the §6 step 9 publish action, exposed here too as a
  fallback/override — not the primary way to publish, which is finishing
  the §6 chat, but available so the Teacher isn't stuck if e.g. they want
  to re-promote an older paper).

No charts, analytics, trends, or paper-editing UI in v1 — just this list.
If it's ever needed, it's easy to add later; it's explicitly not required
now (§13).

## 8. Student workflow

1. There is exactly **one Student** (no accounts/identification needed).
   Student opens a **known, standard URL** on a device on the same LAN.
2. The page's primary call to action is a prominent **"Take Test"** button,
   which always opens the paper named in `papers/latest.txt` (§5/§6).
3. A secondary, deliberately low-prominence link/button lists **every other
   published paper**, each labeled by its status:
   - **Not yet taken** → tapping it takes that paper (this is how an older
     paper that got superseded by a new "latest" before the Student
     attempted it remains reachable and completable).
   - **Completed** → tapping it opens that paper's review screen (§8.10).
   This single list covers both "older untested papers" and "previous
   (completed) tests" — one link, not two competing ones — but it must not
   visually compete with "Take Test."
4. Starting a paper starts a **countdown timer** for that paper's allowed
   time.
5. The timer is **server-authoritative**: based on a persisted start
   timestamp + duration, not client-side state. If the Student closes the
   browser and reopens the paper later, the timer **does not reset**.
6. Question order and each question's option order are **fixed** at
   publish time — not shuffled per attempt.
7. Student answers by tapping an MCQ option per question. Each selection is
   **persisted as it's made**, so answers survive a browser close and so
   auto-submit has something to submit even if the Student never returns.
8. **On timer expiry**, the paper is auto-submitted with whatever was
   selected (unanswered = unanswered), enforced server-side even if no
   browser is open when time runs out.
9. Student can also submit manually before time expires.
10. **No retakes**: once a paper is submitted (manually or by expiry), that
    attempt is final.
11. **After submission**, Student can review the paper: each question, the
    option they picked, the correct answer, and an explanation (from the
    corpus `Note` field, or the GenAI item's stored explanation).

## 9. Persistence requirements

Two different kinds of state, persisted differently:

- **Content (files, §5)**: native corpus, GenAI-approved pools, and
  published papers are plain Markdown files the §6 workflow reads/writes
  directly. The app's ingestion step loads these into its structured store
  (§2) — it doesn't treat them as a live database.
- **Runtime state (app-owned store)**: this changes per Student action and
  must be a proper persisted store the app manages, not files:
  - Each **Student attempt**: which paper, start timestamp, submit
    timestamp (manual or auto), status (not started / in progress /
    submitted / auto-submitted). One attempt per paper (§8.10).
  - Each **Student answer**: which question, which option selected, when
    selected, correctness — persisted incrementally as answered, not only
    at final submit.

  A Teacher **preview** (§6 step 8, §7) is read-only and must **not** create
  or touch a Student attempt record — it renders straight from the
  `papers/<id>.md` file with answers shown, entirely separate from the
  attempt/answer store above.

## 10. Access control / network scope

- The application (both Teacher and Student surfaces) must be reachable
  **only from the LAN** — not exposed to the public internet. Exact
  enforcement mechanism (bind to LAN interface only, IP allowlist, etc.) is
  an implementation decision, not specified further here.
- **Teacher/admin area** (§7), including the dashboard and every paper
  **preview** URL (§6 step 8): gated by a **PIN** — a single fixed value
  stored in a local config/env file, set once at setup. Changing it means
  editing that file (no in-app "change PIN" screen for v1) — simplest
  option that still keeps results and answer keys off-limits to the
  Student.
- **Student area**: no login at all — a single, fixed Student is assumed;
  "reachable only on the LAN" is the only access control for that surface.

## 11. UI/UX requirements

- **Target device: iPad (tablet)** — this is the Student's actual device,
  so touch-target sizing, viewport, and Safari/WebKit behavior should be
  designed and tested against an iPad first, not assumed generically
  "responsive." The Teacher-facing results view can assume a capable adult
  but should still work reasonably in a tablet browser.
- Primary audience for the test-taking UI is a **10-year-old**.
- Content is **predominantly Devanagari** — fonts, line height, and layout
  must render Devanagari clearly and be pleasant at a size a child can read
  comfortably on a tablet (no dense/small text).
- All Student input is **tap selection only** (§4) — no typing of Sanskrit
  required anywhere.
- **"Take Test"** must be the unmistakable focal point of the Student
  landing page; the "other papers" list (§8.3) must be visibly secondary
  (e.g. a small text link, not a competing button).
- Timer must be **clearly visible** and easy for a child to understand
  (simple countdown, not just a raw number with no context).
- Review screen must clearly distinguish: what the Student picked, what the
  correct answer was, and why — in a way a 10-year-old can follow (short,
  simple explanation text, Devanagari-first with minimal English scaffolding
  where the corpus already uses Hindi/English glosses).

## 12. Non-functional notes

- **No LLM dependency inside the running app** — question/distractor
  generation happens entirely offline via a Claude conversation (§6); the
  deployed app only ever reads from its persisted question bank/files. The
  Teacher's device needs internet only during that separate, occasional
  activity, not while the app is serving a test or showing results.
- No internet dependency required for a Student to take a test (LAN-only).
- **Scoring is simple count-correct** — no per-section or per-difficulty
  weighting.
- System should tolerate the Student's browser/device losing connectivity
  or being closed mid-test without losing progress (§8/§9).

## 13. Out of scope (for now)

- Free-text or handwritten Sanskrit input.
- Multi-student / multi-classroom / multi-teacher / multi-tenant support —
  single fixed Student, single Teacher.
- Any in-app/live LLM integration — all GenAI question drafting happens
  offline per §6.
- Retaking a previously *submitted* paper (§8.10) — untaken papers remain
  takeable (§8.3), but a finished attempt is final.
- Per-section/per-difficulty score weighting.
- A form-based in-app paper builder — §6 is the paper-generation path for
  v1; the dashboard's "Make latest" action (§7) is only a fallback
  override, not a builder.
- Charts, analytics, or score trends on the Teacher dashboard — just the
  flat paper list (§7).

## 14. Open questions / decisions needed

None outstanding.

## 15. Flashcards (शब्दार्थ-अभ्यासः / Meanings) — spaced-repetition memorization

Added post-v5 as an incremental feature, alongside the paper-taking flow
described in §7–§8. Purpose: a standing, always-available drill for
memorizing विभागः 1 (Meanings) vocabulary — separate from, and not counted
toward, any test paper or its score.

- **Entry point**: a permanent link/button on the Student landing page
  (alongside "Take Test," §8.2), at `/flashcards`. Unlike a paper, it is not
  tied to `papers/latest.txt` — it is always available and never expires,
  and there is no timer (contrast §8.4–§8.8).
- **Content source**: corpus-only, विभागः 1 exclusively — reads
  `qa-corpus.md` directly at request time (not the ingested-at-boot store
  described in §2, since this section is small and Teacher edits to it
  should show up without a restart). Only `Status: Confirmed` items that
  already carry a `विकल्पाः:` options line are usable (same rule as §4's
  "usable items" definition). This mirrors the §3 hard rule that Meanings is
  always corpus-only — GenAI-approved items are never mixed in here either.
- **Card mechanic**: front face shows the corpus stem (the Sanskrit word
  question) and its 4 options as tap targets, reusing the same MCQ
  presentation as the test-taking flow (§4/§8.7). Submitting an answer
  triggers a flip animation (CSS 3D transform) to a back face showing:
  whether the pick was correct, the correct meaning, the corpus `Note` (if
  any), and — if the corpus answer carries a Latin-script parenthetical
  gloss (e.g. a future entry like `बादल (Cloud)`) — that English meaning on
  its own line. No such glosses exist in the corpus today; the parser
  extracts them generically so it works the moment one is added, with no
  code change needed.
- **Spaced repetition (Leitner, 5 boxes)**: every Meanings item has a box
  (1–5) and a due timestamp, defaulting to box 1 / always-due for an item
  never yet answered. A correct answer promotes the card to the next box and
  pushes its due time out (box 2 → 10 min, box 3 → 1 hr, box 4 → 1 day, box
  5 → 4 days); a wrong answer drops it straight back to box 1, due
  immediately, so it resurfaces ahead of better-known material rather than
  waiting for a future session. Card selection always offers the lowest-box,
  soonest-due eligible item next, excluding only the card just shown (to
  avoid an immediate repeat).
- **Persistence**: a new app-owned runtime table, `flashcard_progress`
  (one row per question ID: box, due timestamp, correct/incorrect counts,
  last result, last seen timestamp) — the same category of state as the
  attempt/answer store in §9, single-Student, no accounts, created lazily on
  first answer.
- **Access control**: same as the rest of the Student surface (§10) —
  reachable on the LAN, no PIN, no login. Not part of the Teacher/admin area
  and has no preview or results view in §7's dashboard.
- **Scoring**: none — there is no attempt record, no submission, and no
  score. Progress is purely the per-item box/due state above, used only to
  choose what to show next.
