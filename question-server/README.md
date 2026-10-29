# CogniRun question server

The questions library and the tiny HTTP API that serves it. No dependencies.

```bash
cd question-server
npm start            # http://localhost:4000, PORT=... to change
```

| Endpoint | Returns |
| --- | --- |
| `GET /questions` | the whole library: `{ version, categories, questions }` |
| `GET /questions?category=math` | only that category (`trivia`, `logic`, `math`) |
| `GET /health` | `{ ok, questions }` |

`questions.js` is the single source of truth: the web app fetches the library from
this server and imports the very same module as its offline fallback (see
`web/src/questions.js`). Categories, the run selection rule and the percentile
framing are described in `docs/QUESTIONS-SPEC.md`.

## Question bank

`questions.js` serves the committed bank `bank/library.generated.js` (383
questions: curated trivia plus templated logic and maths). After editing
`bank/` or `generate/`, rebuild and commit it:

```bash
npm --prefix question-server run generate             # rebuild + validate
npm --prefix question-server run generate -- --check  # is the committed bank current?
```

`select.js` holds the shared, seeded selection (`selectQuestions`) and the
challenge mapping (`buildChallengeQuestionSet`). The schema, id scheme and
contracts are in `docs/QUESTIONS-SPEC.md`.
