# Requirements — Sanskrit Practice & Testing Web App

Status: **Draft v7.** Teacher paper-generation moved from an AI-coding-agent
chat workflow to an in-app, PIN-gated admin builder (§6). Growing a
section's GenAI-approved pool is now its own standalone **Manage Question
Bank** area, split out from paper building — see `TEACHER_WORKFLOW.md` for
the full Teacher-facing requirements.

## 1. Purpose

A LAN-only web application that turns the content in `qa-corpus.md` into
practice/test material for a child learning Sanskrit (5th grade level). Two
personas use it:

- **Teacher**: grows each section's **question bank** (§3) through a
  standalone, PIN-gated **Manage Question Bank** area — copying a generated
  prompt out to a separate web chat LLM (ChatGPT, Google AI Mode, or
  similar), pasting the reply back in for parsing/preview/approval — ahead
  of, and independent from, building any specific paper. Separately,
  generates question papers through a **PIN-gated in-app builder** (§6) by
  selecting sections and how many questions to draw from each section's
  bank. No AI coding agent is involved and the running app never calls an
  LLM itself (§12). The same PIN-gated area is also where the Teacher
  reviews results.
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

## 3. Question sourcing: native vs. GenAI-approved, and the question bank

Every question the app can ever serve comes from one of two **pre-persisted**
pools — the running app never calls an LLM at runtime:

1. **Native items** — taken directly from a section in `qa-corpus.md`.
2. **GenAI-approved items** — questions modeled on a section's style,
   drafted and approved one-by-one, stored **separately** from the native
   corpus (§5) precisely so that a paper can be composed from native
   content alone by simply disregarding the GenAI file(s) — no filtering
   logic needed to exclude "the GenAI ones," just don't read that file.

Together, a section's native `Confirmed` items plus whatever's already
sitting in its GenAI-approved pool are that section's **question bank**.
Growing the bank (drafting and approving new GenAI items) is a standalone
workflow, **Manage Question Bank**, done ahead of and independently from
building any specific paper — see `TEACHER_WORKFLOW.md` §2. When generating
a paper (§6), the Teacher just picks, per selected section, how many
questions to draw from that section's bank; composing the paper takes a
random sample of that size, without replacement, from the bank. There is no
per-paper "new" generation step anymore — if a section's bank is too small
for what a paper needs, the Teacher tops it up via Manage Question Bank
first.

**Hard rule:** विभागः 1 (Meanings) is **always corpus-only**, regardless of
what's requested elsewhere in the same paper — meaning questions must never
be GenAI-generated, since they anchor everything else. No GenAI-approved
file should ever be created for विभागः 1, and Manage Question Bank offers no
generation UI for it (`TEACHER_WORKFLOW.md` §2.1) — its bank is always just
its native items.

If a section's bank doesn't have enough items to satisfy the count a
Teacher wants for a paper, this surfaces immediately when setting that
count (§6): the count field is capped at what's actually banked, so a
paper is never silently under-filled by an over-large request.

## 4. All questions are multiple choice

Because typing Devanagari in a browser is impractical for a 10-year-old,
**every question presented to the Student is multiple choice** — no free-text
or handwriting input anywhere in the Student flow.

- Sections that already encode options in `qa-corpus.md` (e.g. विभागः 8, 11,
  which have `विकल्पाः: ...`) use those options directly.
- Sections that are fill-in-the-blank, translation, or open-answer in the
  corpus have no native distractors for their non-meaning items — those
  must come from the Manage Question Bank drafting-and-approval workflow
  (`TEACHER_WORKFLOW.md` §2) before an item can be shown to a Student.
- विभागः 1 (Meanings) is already fully MCQ-ready natively (§2) — no GenAI
  distractor generation applies there, consistent with the §3 hard rule.
- Distractor sets, once approved, are persisted and never regenerated per
  request, so a given question's options are stable across a paper's
  lifetime, including during Student review after submission.

## 5. File & folder conventions

Concrete artifacts the §6 builder, Manage Question Bank
(`TEACHER_WORKFLOW.md` §2), and the app's ingestion step (§2) read and
write:

- **`qa-corpus.md`** (existing) — native corpus, unchanged Markdown format,
  still hand-edited by the Teacher outside the app.
- **`genai-approved/vibhaga-<NN>.json`** — one file per section that has
  any GenAI-approved items (created on first approval; a section with none
  simply has no file, which is what makes "disregard the GenAI items"
  trivial — §3). JSON (not Markdown) because items are already validated
  as JSON when parsed out of the pasted LLM reply (`TEACHER_WORKFLOW.md`
  §6) and re-serializing through Markdown would be pure overhead. An array
  of item objects with the same fields as before — stem / options / answer
  / status / note — plus `sourceSection` and `approved` (date) metadata,
  and IDs on a `G<NN>-<seq>` scheme (e.g. `G09-001`) so they're visually
  distinct from native `Qxxx` IDs and never collide with future additions
  to the native corpus. Written directly by the running app when the
  Teacher approves an item in Manage Question Bank (`TEACHER_WORKFLOW.md`
  §2), not hand-edited.
- **`papers/<id>.md`** — one file per *composed* paper (`id` e.g.
  `2026-09-20-1904`), published or not, Markdown, unchanged format. Header
  block with sections tested, total time limit, a composed timestamp, and a
  `Published-At:` field that's **absent until the Teacher publishes it from
  the dashboard** (§6/§7) (that absence is what marks a paper "Draft" on
  the dashboard, §7). Body is the resolved, fixed-order question list (with
  the correct option marked and the explanation carried along) — this is
  the exact content the running app serves for that paper, whether to the
  Teacher's preview (§7) or, once published, to the Student.
- **`papers/latest.txt`** — single line naming the currently-latest paper's
  `id`. Updated via the **Make latest** dashboard action (§7) once the
  Teacher approves a composed Draft (§6) (which also sets that paper's
  `Published-At:` if not already set). The running app reads this to know
  what "Take Test" opens. Only papers with `Published-At:` set are ever
  shown to the Student (§8) — a Draft is visible solely on the Teacher
  dashboard (§7) until it's published or abandoned.

## 6. Teacher paper-generation workflow (in-app admin builder)

There is **no AI coding agent involved and no LLM API call from the running
application** — the app never holds an LLM API key. Paper generation is a
wizard inside the existing PIN-gated `/admin` area (§7), and it is
**separate from growing a section's question bank** (§6a) — the builder
only ever draws from banks that already exist; it never generates anything
itself. Full Teacher-facing detail lives in `TEACHER_WORKFLOW.md`; this
section states the requirement, not the UI copy.

1. **Select sections and counts.** A single screen lists all 18 sections as
   a multi-select, each row showing its number, Devanagari + English title,
   how many native `Confirmed` items it has, how many GenAI-approved items
   already exist for it (§5), and the two summed (that section's bank
   total, §3) — the Teacher never has to type or recall a section name. For
   each checked section, a plain numeric input sets how many questions to
   draw from its bank; `0` removes the section. **The count is capped at
   that section's bank total** — it cannot exceed what's actually banked.
   If the Teacher needs more, they grow that section's bank first (§6a),
   then come back. विभागः 1 (Meanings) works the same way, capped at its
   native count (§3's hard rule — its bank is corpus-only).
2. **Set the total time limit**, once every selected section has a valid
   count: common presets (15/20/30/45 min) plus a custom value.
3. **Compose the paper**: an explicit action that, for each selected
   section, takes a random sample without replacement — sized to that
   section's requested count — from its bank (native `Confirmed` items ∪
   GenAI-approved pool, §3), fixes the order, and writes `papers/<id>.md`
   (§5) with no `Published-At:` yet, i.e. a **Draft**. This does not
   publish it.
4. **Preview and publish happen via the dashboard (§7)**, unchanged from
   before: **Preview** (`/admin/preview/:id`) for proofreading with answers
   shown, and **Make latest** (`/admin/make-latest/:id`) to actually
   publish — the builder's job ends at producing a reviewable Draft.

## 6a. Manage Question Bank (in-app, standalone)

Reached from the dashboard independently of the §6 builder — growing a
section's GenAI-approved pool never has to happen inline with composing a
specific paper (`TEACHER_WORKFLOW.md` §2 has the full detail):

1. A section list (`/admin/bank`) showing the same per-section counts as §6
   step 1, each with a link into that section's own page — except विभागः 1
   (Meanings), which shows a "corpus only" note and no link, per §3's hard
   rule.
2. A per-section page showing what's already banked (native usable count +
   every current GenAI-approved item), and a plain numeric input for "how
   many new questions to generate" — an arbitrary count the Teacher
   chooses, unrelated to any paper's requested count.
3. The same **template-generated prompt → Copy Prompt → paste-back
   textarea → Parse → preview + review → approve/edit/reject** loop
   described for the old inline workflow: a prompt filled in with the
   section's number/titles, audience constraints (MCQ-only, roughly
   5th-grade level — §4), **any free-text source material `qa-corpus.md`
   carries for that section outside its item blocks** (e.g. विभागः 5's
   poems, विभागः 7/17's मञ्जूषा word banks) shown in full with an explicit
   instruction that it's the only material new items may draw from — a
   poem-backed item's answer must be an actual line copied from the poem,
   never invented — every existing native and GenAI-approved item in that
   section as style context, the requested count, and an explicit,
   example-backed **output format spec** (the LLM must reply with a JSON
   array of `{stem, options, answer, note}` objects and nothing else, §5).
   Parse extracts a JSON array (tolerating code fences or stray prose
   around it), validates each item (non-empty stem, non-empty distinct
   options, an answer that exactly matches one option), and reports
   failures per-item rather than as a single opaque error. Only items the
   Teacher approves are persisted to `genai-approved/vibhaga-<NN>.json`
   (§5).
4. This can be repeated as many times as the Teacher likes, for any
   section, at any time — there's no fixed target to reach; the bank simply
   grows by however much gets approved.

## 7. Teacher workflow (in the running app)

Paper *generation* and *question-bank growth* both happen here now (§6,
§6a) — the Teacher-facing surface is a PIN gate, then a dashboard, then
either the §6 builder or the §6a bank manager reached from it.

**PIN entry screen**: minimal and adult-oriented (unlike the Student UI, no
need to design for a 10-year-old here) — app name, a plain PIN input
(numeric keypad on touch devices), a submit action, and a simple error
state on a wrong PIN. Nothing else on this screen.

**Dashboard (after a correct PIN)**: a **"Build New Paper"** entry point
into the §6 builder, a **"Manage Question Bank"** entry point into the §6a
bank manager, plus a list of every paper in `papers/`, most recent first.
Each row shows:

- Paper id/date and a one-line contents summary (e.g. *"5 sections · 24
  questions · 20 min"*).
- A status badge: **Latest** (what "Take Test" currently opens), **Draft**
  (composed via §6 step 3 but never published — i.e. not `latest.txt` and
  never was), **Taken** (with the score, e.g. *"18/24"*), or **Not taken**
  (published or draft, but the Student hasn't opened it).
- Row actions, only the ones that apply: **Preview** (§6's
  render-with-answers-shown view — available for any paper, published or
  not, so it doubles as both the pre-publish proofread and a permanent "what
  was actually asked" record), **View results** (only once Taken — full
  per-question breakdown: the Student's pick, the correct answer, whether
  it was right, and time taken), and, if a paper isn't already Latest,
  **Make latest** — the actual publish action (§6 step 4): the builder only
  ever produces a Draft, so this dashboard action is how every paper, new
  or re-promoted, actually goes live.

No charts, analytics, trends in v1 beyond the builder and this list. If
ever needed, easy to add later; not required now (§13).

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

- **Content (files, §5)**: native corpus (`qa-corpus.md`) and published
  papers (`papers/<id>.md`) remain plain Markdown; GenAI-approved pools
  (`genai-approved/vibhaga-<NN>.json`, §5) are JSON. Unlike the old
  agent-driven workflow, the **running app itself** now writes
  GenAI-approved items (on approval, §6a) and paper files (on compose/
  publish, §6/§7), so the app's structured store (§2) must reflect a
  newly-written file **in-process**, immediately — not only at boot —
  otherwise a just-approved item wouldn't be selectable as part of a
  section's bank in the same or a later paper composition.
- **Runtime state (app-owned store)**: this changes per Student action and
  must be a proper persisted store the app manages, not files:
  - Each **Student attempt**: which paper, start timestamp, submit
    timestamp (manual or auto), status (not started / in progress /
    submitted / auto-submitted). One attempt per paper (§8.10).
  - Each **Student answer**: which question, which option selected, when
    selected, correctness — persisted incrementally as answered, not only
    at final submit.

  A Teacher **preview** (§6, §7) is read-only and must **not** create
  or touch a Student attempt record — it renders straight from the
  `papers/<id>.md` file with answers shown, entirely separate from the
  attempt/answer store above.

## 10. Access control / network scope

- The application (both Teacher and Student surfaces) must be reachable
  **only from the LAN** — not exposed to the public internet. Exact
  enforcement mechanism (bind to LAN interface only, IP allowlist, etc.) is
  an implementation decision, not specified further here.
- **Teacher/admin area** (§7), including the dashboard and every paper
  **preview** URL (§6, §7): gated by a **PIN** — a single fixed value
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

- **No LLM dependency inside the running app** — the app itself never calls
  an LLM API. GenAI question drafting (§6a) relies on the Teacher manually
  copying a generated prompt into a separate web chat LLM (ChatGPT, Google
  AI Mode, or similar) and pasting the reply back in; the app only ever
  parses that pasted text and reads from its persisted question bank/files.
  The Teacher's device needs internet only during that separate, occasional
  copy/paste activity, not while the app is serving a test or showing
  results.
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
  offline per §6a.
- Retaking a previously *submitted* paper (§8.10) — untaken papers remain
  takeable (§8.3), but a finished attempt is final.
- Per-section/per-difficulty score weighting.
- Fully automated GenAI generation with no human in the loop — the app
  never calls an LLM directly (§12); every GenAI item is manually
  copy/pasted from an external web chat LLM and reviewed by the Teacher
  before it's persisted (§6a).
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
