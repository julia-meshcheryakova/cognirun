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

`question-server/questions.js` is the single source of truth: **10 questions per
category, 30 in total**, short enough to answer while running.

```js
{
  id: 'math-2',              // unique, `<category>-<n>`
  category: 'math',          // one of the three ids above
  prompt: 'What is 15% of 200?',
  answer: '30',              // the correct answer
  options: ['15', '20', '30', '35'],  // optional; multiple choice when present
  difficulty: 'easy',        // easy | medium | hard
}
```

- Questions with `options` render as tap-to-answer buttons (faster while running)
  and are graded automatically (`correct: true/false`).
- Questions without `options` render as a free-text box and are **not** graded
  (`correct: null`); the correct answer is revealed after submitting.

## 3. Selection during a run

A 3 km run asks exactly one question per category, in this order:

| Kilometer | Category |
| --- | --- |
| 1 | Trivia |
| 2 | Logic |
| 3 | Mathematical |

Selection is **reproducible**: the first question of each category (index 0) is
used. All of that logic lives in one place — `selectRunQuestions()` in
`web/src/questions.js` — so swapping in a random or spaced-repetition pick later
is a one-line change.

## 4. Separate question server

`question-server/` is a dependency-free Node HTTP server, decoupled from the web
app (see its README):

- `GET /questions` → `{ version, categories, questions }`
- `GET /questions?category=math` → only that category
- `GET /health` → `{ ok, questions }`

The web app calls `loadLibrary()` at the start of every run; it fetches
`${QUESTION_SERVER_URL}/questions` (`VITE_QUESTION_SERVER_URL`, default
`http://localhost:4000`) and **falls back to the bundled copy of the same module**
if the server is missing, errors, returns an empty library or does not answer within
2 seconds (a run must never be blocked by the server). So demo mode
and offline use always work, and the returned `source` (`server` | `bundled`)
records which library was used.

## 5. End-of-run percentile framing

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

## 6. Phased plan followed

1. **Phase 1** — question schema + 30 bundled questions; app asks one per category
   at km 1/2/3 from the bundled library.
2. **Phase 2** — extract the library into `question-server/`; app fetches from it
   with the bundled library as fallback.
3. **Phase 3** — per-category scoring and percentile framing on the results page
   with the stub population baseline.
4. **Phase 4** — this spec, styling for choice buttons and the profile list, tests
   (`web/test/questions.test.mjs`) and an x1000 demo-run verification.
