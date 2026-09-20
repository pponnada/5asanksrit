# Teacher Workflow — Building a Question Paper

This is a playbook for **any AI coding agent** helping the Teacher build a
new Sanskrit test paper in this repository — Claude Code, opencode, or
anything else with the ability to read/write files here and hold an
ordinary back-and-forth conversation. Nothing here depends on a specific
vendor's tools. Where your environment happens to offer a structured
multiple-choice prompt UI, use it — batch up to 4 questions per prompt if
your UI supports that. Where it doesn't, just present the same choices as a
plain numbered list in chat and read back the Teacher's typed reply. The
steps and the files you touch are identical either way.

You never need the web server running to do any of this — every step here
is reading and writing plain files in this repository.

**Rendering headings in chat:** some agent TUIs (including Claude Code's)
struggle to render Devanagari correctly. When referring to a section (विभागः
1…26) or subsection in chat with the Teacher, use **only its English
heading/subheading** — never the Devanagari — e.g. say "Section 9 — Fill in
the blank with the correct verb from the word box" rather than "विभागः 9 —
मञ्जूषातः उचितम् क्रिया-पदम् गृहीत्वा वाक्यानि पूरयत". This applies to chat
output only: file contents (`qa-corpus.md`, `genai-approved/*.md`,
`papers/*.md`) still use Devanagari as normal — do not strip it from any
file you write.

## What you're producing

A file at `papers/<id>.md` (see format below) and, only once the Teacher
explicitly says to publish, an update to `papers/latest.txt` pointing at
it. That's the entire deliverable — the running app does the rest.

## Step by step

### 1. Walk through every section, asking how many questions

Read `qa-corpus.md` and count, per section (`विभागः 1` … `विभागः 26`), how
many `Status: Confirmed` items exist and how many have a `विकल्पाः:` line
(only those are directly usable as MCQ — see "Usable items" below). Also
check `genai-approved/vibhaga-<NN>.md` for that section, if it exists, and
count its items too.

For each section, ask the Teacher how many questions to draw from it.
**Never make the Teacher type or recall a section name** — show it to them:
the section's number and English title (Devanagari omitted per the
rendering note above), and how many native / GenAI-approved items
currently exist for it, e.g.:

> Section 9 — Choose the right verb form from the word box — 6 usable in
> corpus, 0 approved-GenAI. How many? [0 / 3 / 5 / other]

Batch up to 4 sections per prompt if you can; otherwise ask them one at a
time in order. `0` (skip) is always a valid answer.

### 2. Ask source mix for every section with a non-zero count

Skip this for Section 1 (Meanings) — it is **always corpus-only**, no
exceptions, because it's the vocabulary foundation everything else depends
on. State this rather than asking about it.

For every other section the Teacher wants questions from, ask: **corpus
only**, or **corpus + GenAI-approved**?

### 3. Ask the total time limit, once

A single number of minutes for the whole paper (there is no per-question
timer). Offer common presets (15 / 20 / 30 / 45) plus the option to type
something else.

### 4. Check whether every request can actually be filled

For each section, is `(native Confirmed usable items) [+ (GenAI-approved
items) if that section's mix includes GenAI]` ≥ the requested count? If
every section clears this bar, skip straight to step 6 — most sessions,
once a section's GenAI pool has been built up once, will land here.

### 5. If something's short, draft it — then get it approved

For any section that's short, draft the missing items yourself, modeled on
that section's existing style (same kind of stem, same register, same
difficulty), each with a correct answer and (for non-Meanings sections)
plausible distractors. **Never draft new Meanings items** — that section is
corpus-only, full stop.

Show the whole batch to the Teacher as plain, readable Sanskrit text in the
chat — this step is a reading/proofreading task, not a multiple-choice one,
so let the Teacher reply in free text ("approve all", "drop #3", "change
option B on #5 to X"). Loop only on what needs rework.

Once approved, append the items to `genai-approved/vibhaga-<NN>.md`,
creating the file if it doesn't exist yet (format below). This means the
next paper that needs this section will very likely hit the fast path at
step 4.

### 6. Compose the paper file

Pick the exact items per section — a random sample without replacement from
whichever pool(s) the source-mix choice allows — fix their order, and write
`papers/<id>.md` (format below). Use an id that sorts correctly against
other papers, e.g. `YYYY-MM-DD-HHMM`. **Do not touch `papers/latest.txt`
yet** — writing this file does not publish anything.

### 7. Hand the Teacher a preview link

Tell them: `http://<lan-host>:<port>/admin/preview/<id>` (they'll need
their Teacher PIN). This renders the paper exactly as the Student will see
each question, but with the correct answer and explanation shown inline and
no timer, so they can proofread content and check the visual look without
faking a timed run.

Wait for their response. If they ask for changes, edit `papers/<id>.md`
directly and tell them to reload the same URL — no new id needed unless the
underlying question selection itself has to be redone.

### 8. Publish only when they explicitly say to

On a clear go-ahead ("looks good, publish" or equivalent), two writes,
in order:

1. Add a `Published-At: <current ISO timestamp>` line to `papers/<id>.md`'s
   header block (right after `Composed-At:`). This stamp is what makes the
   paper reachable/takeable by the Student at all, and it's what keeps it
   reachable later even after a newer paper takes over "latest" — so it
   must never be removed or overwritten once set.
2. Overwrite `papers/latest.txt` with just the paper's id (one line, no
   extra whitespace beyond a trailing newline).

Together these are the only things that make a paper live — the paper
immediately becomes what the Student's "Take Test" button opens, and the
paper it replaces moves into the "other papers" list on the landing page
(reachable and takeable if the Student never got to it, review-only if
they already finished it).

Never publish without an explicit go-ahead, and never skip step 7. If a
paper is already published and you're just re-promoting it back to
"latest" (the Teacher asks for an older paper to become the target again),
only do write 2 — never touch an existing `Published-At` stamp.

## Usable items

An item only counts as ready-to-serve if it has a `विकल्पाः:` line already
(native items in translation/fill-blank sections that lack one are not
directly usable — see `server/content/parseCorpus.js` for the exact rule).
If a section the Teacher wants is short specifically because of this,
that's exactly what step 5's drafting-and-approval loop is for: draft a
GenAI-approved replacement item in that section's style, with proper
options this time.

## File formats

### `genai-approved/vibhaga-<NN>.md`

One file per section that has any approved items — `NN` is the section
number, zero-padded to 2 digits (e.g. `vibhaga-09.md`). Never create
`vibhaga-01.md` (Meanings is corpus-only). Same per-item shape as
`qa-corpus.md`, with two extra metadata lines and IDs in a `G<NN>-<seq>`
scheme so they never collide with native `Qxxx` IDs:

```
G09-001: वयम् ______________ । (चल्)
विकल्पाः: चलामः, चलसि, चलथ, चलति
Answer: चलामः
Status: Confirmed
Source-Section: विभागः 9
Approved: 2026-09-20
Note: उत्तमपुरुष-बहुवचनस्य रूपम्।

G09-002: ...
```

### `papers/<id>.md`

A small metadata header (blank line terminates it), then the resolved,
fixed-order item list — same per-item shape again, minus `Status` (already
implied by being included) and minus the `G<NN>-<seq>` source metadata
(irrelevant once it's in a paper):

```
# Paper 2026-09-20-1904

Sections: विभागः 1, विभागः 9, विभागः 24
Time-Limit-Minutes: 20
Composed-At: 2026-09-20T19:04:00Z
Published-At: 2026-09-20T19:10:00Z

Q131: "अहम्" इत्यस्य अर्थः कः?
विकल्पाः: मैं, तुम, हम सब, तुम सब
Answer: मैं

G09-001: वयम् ______________ । (चल्)
विकल्पाः: चलामः, चलसि, चलथ, चलति
Answer: चलामः
Note: उत्तमपुरुष-बहुवचनस्य रूपम्।
```

`Published-At` is what step 6 leaves out and step 8 adds — a paper file on
disk without it is a **Draft**: composed, previewable, but not reachable by
the Student and not eligible to be "latest" until step 8 stamps it.

## Example session

```
Teacher: let's build a new test

Agent:  [reads qa-corpus.md + genai-approved/*.md]
        Section 1 — Meanings — 162 usable in corpus.
        How many? [0 / 5 / 8 / 10 / other]
Teacher: 8
Agent:  Section 9 — Choose the right verb form from the word box — 6 usable, 0 approved-genai.
        How many? [0 / 3 / other]
Teacher: 8
... (all 26 sections, batched)

Agent:  Section 9 (8 requested): corpus only, or corpus + genai-approved?
Teacher: corpus + genai

Agent:  Total time for the paper? [15 / 20 / 30 / other]
Teacher: 20

Agent:  Section 9 is short by 2 — drafting 2 candidates now...
        [shows the 2 draft Q&A blocks]
Teacher: approve both
Agent:  Saved to genai-approved/vibhaga-09.md. Composing the paper...
        Draft ready: papers/2026-09-20-1904.md (5 sections, 24 questions, 20 min)
        Preview: http://<lan-host>:3000/admin/preview/2026-09-20-1904
Teacher: [checks it] looks good, publish
Agent:  Published — papers/latest.txt now points at 2026-09-20-1904.
```
