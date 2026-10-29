# CogniRun questions library — spec

How questions are defined, served, selected during a run, and turned into a
population-relative cognitive profile at the end of the run.

## 1. Categories

A run probes three cognitive dimensions:

| id | Name | What it measures |
| --- | --- | --- |
| `trivia` | Trivia / general knowledge | factual recall |
| `logic` | Simple logic | deduction from given premises |
| `math` | Mathematical | arithmetic and numeric reasoning |

## 2. Library

`question-server/questions.js` exports `QUESTION_LIBRARY = { version: 2,
categories, questions }`, the single source of truth for the server, the web
app and the LLM judge (which looks questions up by `id`). Its questions are the
**committed, generated bank** `question-server/bank/library.generated.js`:

| | easy | medium | hard | total |
| --- | --- | --- | --- | --- |
| trivia | 47 | 49 | 47 | 143 |
| logic | 40 | 40 | 40 | 120 |
| math | 40 | 40 | 40 | 120 |
| **all** | | | | **383** |

```js
{
  id: 'math-pct-vk6d7t',           // unique and stable, see "Ids" below
  category: 'math',                // trivia | logic | math
  difficulty: 'medium',            // easy | medium | hard
  prompt: 'What is 10 percent of 120?',
  answer: '12',                    // canonical answer, shown after answering
  acceptedAnswers: ['twelve'],     // optional aliases the judge also accepts
  options: ['12', '22', '24', '108'],  // optional; multiple choice when present
}
```

- Questions with `options` render as tap-to-answer buttons; a tap submits the
  option text. Every question can also be answered by voice or by typing; the
  answer judge (`web/src/judge.js`) compares normalised text with `answer` and
  `acceptedAnswers` (exact, then contained in a sentence), then asks the
  server-side LLM judge.
- The judge does **not** turn "twelve" into "12", so the build adds the spoken
  words of every whole-number answer to `acceptedAnswers` ("fifty six", and
  "one hundred and fifty six" next to "one hundred fifty six"; years also as
  "nineteen sixty nine").

### Ids

- `trivia-<n>`, `logic-<n>`, `math-<n>`: curated questions. `1`–`10` of each
  category are the original 30 (`bank/core.js`, unchanged); `trivia-11` onward
  live in `bank/trivia.js`. Never renumber or reuse a number.
- `<category>-<template>-<hash>`: generated, e.g. `logic-seq-add-u435j2`. The hash
  is of the prompt, so an id is stable as long as its template produces the same
  prompt from the same seed.

Saved runs, challenges and the LLM judge reference ids, so **an id must never
change meaning**. Fix a wrong question by editing it in place (same id) or by
removing it; never give its id to a different question.

### Rules (enforced by `generate/validate.js`)

- `id` is `<category>-<slug>`, unique; `prompt` is unique (case-insensitive) and
  at most 160 characters.
- `category` and `difficulty` are one of the allowed values.
- `answer` or one of `acceptedAnswers` is short to say: at most 3 words and 24
  characters. A multiple-choice `answer` must itself be short.
- `options`: 2–5 distinct strings that include `answer`, with no `"` (options are
  matched with attribute selectors). Prefer 4, or 3 for ordinals and
  Yes/No/Cannot tell.
- `web/test/questions.test.mjs` also runs the real judge on the whole bank: every
  answer and alias grades correct, and no wrong option grades correct.
- Avoid accents (the judge drops non-ASCII letters), disputed or time-sensitive
  facts, and answers that are a word inside a distractor.

## 3. The bank and how to add questions

```
question-server/
  bank/schema.js              BANK_VERSION, CATEGORIES, DIFFICULTIES
  bank/core.js                the original 30 questions (frozen)
  bank/trivia.js              curated trivia with distractors
  bank/library.generated.js   GENERATED, committed: the served bank
  generate/math.js            maths templates
  generate/logic.js           logic templates
  generate/templates.js       runs templates: seeded, deduplicated, id = template + hash
  generate/build.js           buildBank(): core + trivia + templates, spoken numbers
  generate/validate.js        validateBank(), bankStats()
  generate/cli.mjs            the `generate` command
  generate/groqDraft.mjs      optional LLM drafts for review
```

`npm --prefix question-server run generate` rebuilds the bank, validates it (at
least 300 questions, at least 30 per category and difficulty) and rewrites
`bank/library.generated.js`, one question per line. `-- --check` only verifies
that the committed file is current, and a test in `question-server/test/bank.test.mjs`
does the same, so a stale bank fails `npm run check`.

**Generators.** Each template has a `key`, a `difficulty` and `make(rng)`
returning `{ prompt, answer, options, acceptedAnswers? }`. Templates of one
difficulty take turns, each with its own RNG seeded from
`cognirun-bank-v1:<category>:<key>`, until the cell reaches 40 questions
(curated questions count towards it). Duplicate prompts are skipped.

- Maths, all whole-number answers: easy is +, −, ×, halves, laps, km left;
  medium is percentages, ×, ÷, pace, run duration, minutes to seconds; hard is
  distance from pace, speed in km/h, cut times, two-digit ×, squares, harder
  percentages, half-minutes to seconds.
- Logic: number sequences (+, −, ×, growing steps, Fibonacci-like, alternating,
  squares, doubling), odd one out (words, kinds, multiples, primes), orderings of
  3–4 people, days of the week, either/or, syllogisms (all/some, "must"
  converses) and race-place puzzles.

**To add trivia**, append to `bank/trivia.js` with the next free number:
`t(144, 'medium', 'Prompt?', 'Answer', ['Answer', 'Wrong', 'Wrong', 'Wrong'])`,
then run `generate` and commit both files. **To add a template**, add it to
`generate/math.js` or `generate/logic.js`. Existing generated ids stay as they
are as long as existing templates and `BANK_SEED` are unchanged. A new template
may only displace generated questions that no published challenge uses, so check
the diff of `library.generated.js`. Changing `BANK_SEED` or a template's prompt
wording re-ids its questions: don't, once runs reference them.

**LLM drafts (optional).** `GROQ_API_KEY=... npm --prefix question-server run
generate -- --groq-draft 10 --category trivia` asks Groq for drafts and writes
them, with validator findings, to `bank/review/*.json` (git-ignored). A human
fact-checks them and copies approved ones into `bank/trivia.js`. The key is
read from the environment only; tests and the build never call Groq.

**Bundle size.** The web app bundles the whole bank as its offline fallback
(about 78 KB raw, 15 KB gzipped; the whole app bundle is about 33 KB gzipped). That keeps every challenge's question
ids resolvable with no server, and `/questions` serves the same full bank.

## 4. Selection

All selection is in `question-server/select.js` (pure, no I/O), re-exported by
`web/src/questions.js`, so the server and the browser pick the same questions.

```js
selectQuestions({ library, count, seed, exclude = [], difficulties = [] }) -> Question[]
```

- Slot `i` asks category `ROTATION[i % 3]`: trivia → logic → maths → trivia ….
- No question is used twice. Within a category the order is by
  `hash(seed + id)`, so the result depends on the seed and the ids, not on the
  bank's order, and adding questions only changes picks where a new one ranks first.
- `difficulties[i]` (optional) is slot `i`'s target; the closest available
  difficulty wins.
- `exclude` (ids) is soft. Fallbacks, in order: same category, not excluded →
  same category, excluded → any category, not excluded → anything left. It
  throws only when the library has fewer than `count` questions.

**Solo runs** (`startRun` in `web/src/main.js`) call
`selectSoloQuestions({ library, count, recentRuns })` with a random seed.
`recentRuns` is the runner's saved runs (`store.list({ includeDemo: false })`,
newest first), and `recentQuestionIds()` excludes their last 150 question ids.
`selectRunQuestions(library, count = 3)` stays as the deterministic "first
questions of each category" pick. Tests use it, and it fills a challenge whose
ids are missing from the library.

## 5. Challenge mapping (contract for weekly challenges)

```js
import { buildChallengeQuestionSet } from './questions.js';  // web/src/questions.js
// or '../question-server/select.js' on the server
buildChallengeQuestionSet({ challengeId: '2026-W02-5k', course: '5k' })
// -> ['trivia-23', 'logic-seq-down-bdmpo6', 'math-duration-yxkqk1', 'trivia-77', 'logic-7']
```

- **Input:** `challengeId` (any non-empty string; weekly ids start with the ISO
  week `YYYY-Www`) and `course` (`'3k' | '5k' | '10k'`). Optional: `library`
  (default `QUESTION_LIBRARY`) and `count` (default: the km in `course`, which
  equals `questionCountOf(course)` for `CHALLENGE_COURSES`).
- **Output:** the ordered question ids, one per km, for
  `startRun({ course, challengeId, questionIds })`.
- **Deterministic** from `(challengeId, course)` for a given bank.
- **Category rotation** trivia → logic → maths and **no repeats**.
- **Difficulty curve**, easier early and harder late: `difficultyCurve(n)` gives
  3K = easy, medium, hard; 5K = easy, easy, medium, medium, hard; 10K = 4 easy,
  3 medium, 3 hard.
- **No overlap week to week:** for `YYYY-Www…` ids, each question belongs to one
  of two fixed halves of the bank (by a hash of its id), and even and odd ISO
  weeks use opposite halves. So consecutive weeks of the same length share no
  question, including across year ends. Ids without a week use the whole bank.
- The set depends on the bank's contents. Persist the ids when a challenge is
  published if they must never change, e.g. after the bank grows.

## 6. Separate question server

`question-server/` is a dependency-free Node HTTP server, decoupled from the web
app (see its README):

- `GET /questions` → `{ version, categories, questions }`
- `GET /questions?category=math` → only that category
- `GET /health` → `{ ok, questions }`

The web app calls `loadLibrary()` at the start of every run; it fetches
`${QUESTION_SERVER_URL}/questions` (`VITE_QUESTION_SERVER_URL`, default
`http://localhost:4000`) and **falls back to the bundled copy of the same module**
if the server is missing, errors, does not answer within 2 seconds, or returns a
library that lacks any of the three run categories (a run must never be blocked or
broken by the server). So demo mode and offline use always work, and the returned
`source` (`server` | `bundled`) records which library was used.

## 7. End-of-run percentile framing

The point of the results page is not the raw score but *which cognitive dimensions
you are strong and weak in relative to other people*. For each category the
results page shows a line like:

> **Maths:** you outperform 90% of the population (100 pts)

Model (`web/src/percentile.js`):

- **Category score** = the average points earned on that category's questions in
  the run (one question per category today, so simply that question's points).
  Points come from the existing speed-based scoring: 100 points instantly decaying
  linearly to 50 points at the 60 second window (0 if the window expires).
- **Population baseline (stub)** — a normal distribution per category of the score
  an average runner earns. Documented assumption, not data: answering while
  running is hardest for maths and easiest for trivia, so the same score lands in
  a higher percentile for maths.

  | Category | mean | sd |
  | --- | --- | --- |
  | trivia | 80 | 10 |
  | logic | 72 | 12 |
  | math | 66 | 14 |

- **Percentile** = normal CDF of the standardised score, clamped to 1–99% so we
  never claim to beat everyone.
- Categories that were not asked (a run cut short) are shown as "not asked this
  run" rather than as a 0-point percentile.

When real runs are collected, only `POPULATION` and the score definition need to
change; the results UI stays as is. Correctness (already recorded for multiple
choice) is the obvious next input to the category score.

## 8. Phased plan followed

1. **Phase 1** — question schema + 30 bundled questions; app asks one per category
   at km 1/2/3 from the bundled library.
2. **Phase 2** — extract the library into `question-server/`; app fetches from it
   with the bundled library as fallback.
3. **Phase 3** — per-category scoring and percentile framing on the results page
   with the stub population baseline.
4. **Phase 4** — this spec, styling for choice buttons and the profile list, tests
   (`web/test/questions.test.mjs`) and an x1000 demo-run verification.
5. **Phase 5** — the generated bank (curated trivia + maths/logic templates,
   validator, `generate` CLI), seeded selection, challenge mapping and solo runs
   that avoid recently asked questions.
