# Distil intelligence layer

The map of every stage that decides what a reader sees in Distil: what each stage does, which
prompt and model it uses, how important and how complex it is, and how it is measured. The file
also holds the evaluation framework, the model policy and the target shape of the code.

Audited against `main` at `5fe4369` on 2026-10-01; line numbers are from that commit. "Intelligence"
means anything that changes what the reader sees or in what order: model calls, and the
deterministic rules around them.

Keep this file current. A pull request that changes a stage, a prompt version, a model assignment,
a ranking constant or a metric updates the matching section here. Progress and plans live in the
state log under the topic `intelligence-layer`, not in this file.

Sections: 1 the layer at a glance · 2 priority and complexity · 3 stage cards · 4 what exists for
evaluation today · 5 evaluation framework · 6 model policy · 7 target shape of the code ·
8 findings · appendix A scorecard queries · appendix B prompt index.

## 1. The layer at a glance

```text
capture (extension, /save, iPhone Shortcut)
  S1  fetch, extract, readability gate              rules
  S10 content version and chunks                    rules      nothing reads them
  S2  brief summary                                 model      flash-lite or sonnet-4-6
  S3  life area                                     model      flash-lite

Today and Feed
  S4  ranking and Today's six                       SQL formula
  S9  "Worth revisiting" strip                      SQL rule   never fills
  S8  search                                        Postgres full-text

reader
  S6  detailed summary, on demand                   model      sonnet-4-6
  S5  thumbs, preference profile, reprioritize      model + heuristic
  S7  deep research, on demand, queued              model      five call types
```

### Live stages

| ID  | Stage                            | Runs                                | Kind              | Model (preferred, then fallback)                                           | Prompt version         | Evaluated today       |
| --- | -------------------------------- | ----------------------------------- | ----------------- | -------------------------------------------------------------------------- | ---------------------- | --------------------- |
| S1  | Extraction and readability gate  | Every capture                       | Rules             | none                                                                       | n/a                    | No                    |
| S2  | Brief summary                    | Every capture; regenerate in reader | Model             | `gemini-3.5-flash-lite` under ~2k tokens, `claude-sonnet-4-6` above        | `summary-v2`           | No                    |
| S3  | Life area                        | Every capture                       | Model             | `gemini-3.5-flash-lite`                                                    | `area-v1` (not stored) | No                    |
| S4  | Today selection and feed ranking | Every page load                     | SQL formula       | none                                                                       | none                   | No                    |
| S5  | Feedback and preference learning | Each thumbs rating                  | Model + heuristic | `gemini-3.5-flash-lite`                                                    | none                   | No                    |
| S6  | Detailed summary                 | On demand in the reader             | Model             | `claude-sonnet-4-6`, else `gemini-3.5-flash`                               | `summary-v2`           | By hand (delta check) |
| S7  | Deep research                    | On demand, queue worker             | Model             | `gemini-3.5-flash`, `gemini-3-flash-preview` grounded, `claude-sonnet-4-6` | none                   | No                    |
| S8  | Search                           | Typing in the header                | Postgres FTS      | none                                                                       | n/a                    | No                    |
| S9  | Worth revisiting                 | Today load                          | SQL rule          | none                                                                       | n/a                    | No (never fills)      |
| S10 | Knowledge index                  | Every capture                       | Rules             | none                                                                       | n/a                    | No (no reader)        |

### Stages other stages expect, but that do not run in the hosted product

| Missing stage                    | Who expects it                                                                                                         | Where the code is                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Topic assignment                 | Preference weights, feed affinity, topic filter, research suggestions, the `Topics` line in the brief and area prompts | Only in the connector pipeline (`src/lib/intelligence/enricher.ts`), disabled |
| Capture priority score           | Today's order, `for_you` order                                                                                         | Not built (backlog item of 2026-10-01)                                        |
| Junk-page check                  | Everything after extraction                                                                                            | Not built (same backlog item)                                                 |
| Open and reading-progress events | "Worth revisiting", feed affinity (`completed`), any measure of whether Today was useful                               | Event types exist; no code writes them                                        |

### Code that exists but is unreachable or inert in the hosted product

| Code                                                                                                  | Status                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connector pipeline `src/lib/intelligence/` (classify, relevance gate, clean-up, analysis, enrichment) | Called only by the Gmail, Slack and publisher connectors. Their routes return 404 and the sync scheduler does not start on Vercel. Holds the only topic tagger (`auto-tag`). |
| Model ranking in `src/lib/ai/prioritize.ts` (`useAI`)                                                 | Only `POST /api/ai/prioritize` can turn it on; no UI calls that route.                                                                                                       |
| Grounded summary runtime `src/lib/knowledge/intelligence-runtime.ts` (`grounded-summary-v1`)          | No job handler runs it.                                                                                                                                                      |
| Research suggestions `src/lib/agent/proactive-research.ts`                                            | The Research page button runs it, but it clusters by topic and topics are empty. A table constraint would also reject its rows (static reading, not executed; finding 18).   |
| Feed affinity (`for_you` personalization)                                                             | Behind `FEATURE_PERSONALIZATION`; the events it sums are not written (finding 4).                                                                                            |
| Digests                                                                                               | Behind `FEATURE_DIGESTS`; cron removed 2026-09-30; no model involved.                                                                                                        |
| Embeddings                                                                                            | Table only; nothing writes or reads it.                                                                                                                                      |

## 2. Priority and complexity

Importance is how much of the daily experience depends on the stage and how far a bad output
spreads. Complexity is how hard the stage is to get right and to measure. Ranked by importance.

| Rank | Stage                          | Importance                                                                                                  | Complexity                                                                     | State today                                                                                   |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1    | S4 Today selection and ranking | Critical. Today is the product's daily surface.                                                             | High. Needs signals, labels and a judgement of what matters to one person.     | No intelligence. Every capture is `medium`, so Today is the six newest unread items.          |
| 2    | S2 Brief summary               | Critical. On every card and at the top of every item; a wrong brief is invisible unless the source is read. | Medium to high. Routing, long documents, faithfulness.                         | Works. Quality never measured. The cheapest model writes every brief under about 1,400 words. |
| 3    | S1 Extraction and gate         | Critical foundation. A junk or cut-off extraction poisons the brief, the area and the ranking.              | Medium. Long tail of page shapes; cheap to test.                               | Works for articles. Only an 80-character gate. YouTube on Production is title-only.           |
| 4    | S5 Feedback and learning       | High. The only way ranking can become personal.                                                             | Medium to high.                                                                | Mostly disconnected (findings 3 to 6).                                                        |
| 5    | S3 Life area                   | Medium. Organises the library; a wrong area is visible and takes two taps to fix.                           | Low. Four labels.                                                              | Works. The only stage whose corrections feed back. Accuracy never measured.                   |
| 6    | S6 Detailed summary            | Medium. Depth on demand.                                                                                    | Medium.                                                                        | Works. The only stage with an eval, run by hand, never on the model Production uses.          |
| 7    | S8 Search                      | Medium. Finding things again.                                                                               | Low.                                                                           | Deterministic. Does not search the article body or the brief. Relevance never tested.         |
| 8    | S7 Deep research               | Medium to low for the daily loop.                                                                           | Very high. Nine to fourteen calls, grounding, citations, a 60-second function. | Works after R1 to R3. The costliest stage per run. No eval.                                   |
| 9    | S9 Worth revisiting            | Low.                                                                                                        | Low.                                                                           | Never fills: nothing records an open.                                                         |
| 10   | S10 Knowledge index            | Low today.                                                                                                  | Low.                                                                           | Writes three tables per capture that no live surface reads.                                   |

Reading the table as a grid:

- **Important and simple, do first:** the junk-page gate (S1), topics, the area eval (S3), recording
  opens.
- **Important and hard, invest:** Today's ranking (S4) and brief quality (S2).
- **Less important and hard, contain:** deep research (S7). Measure it, do not expand it.
- **Less important and simple, tidy:** search, revisiting, the knowledge index.

## 3. Stage cards

### 3.1 S1 Extraction and readability gate

- **Does:** fetches the page, extracts the readable article, rejects pages with no readable text,
  and stores the item.
- **Code:** `src/lib/capture/service.ts` (receipt, URL dedupe, SSRF guard), then
  `src/lib/queue/capture-consumer.ts`, then `createDefaultCaptureProcessor` in
  `src/lib/capture/worker.ts`. Readability lives in `src/lib/content-extractor.ts` and
  `src/lib/content-sanitizer.ts`. Special shapes: Granola (`src/lib/granola.ts`), Wispr Flow
  (`src/lib/wispr.ts`), YouTube (`src/lib/youtube.ts`), X posts (`src/lib/og.ts`).
- **Model:** none.
- **Gate:** reject when the readable text is under 80 characters (`MIN_READABLE_TEXT_CHARACTERS`,
  `worker.ts:39`, `worker.ts:432`). Private Granola or Wispr links, unreadable videos and empty
  posts are rejected with their own messages.
- **Stores:** `items` (title, author, publication, reader HTML in `full_content`, and `summary` set
  to the capture note, else the page description, else the first 277 characters) and `raw_content`.
- **Duplicates:** by normalized URL only. The same story from two sources is two items.
- **Known gaps:** login walls, consent pages, paywall stubs and error pages over 80 characters are
  saved, summarised and classified. YouTube on Production returns only title, channel and thumbnail
  (recorded 2026-09-20, undecided). A capture interrupted after the item is stored is marked ready
  on retry without running the brief or the area again (`worker.ts:219-226`).
- **Measured today:** receipt status and error code in `capture_requests`; rejected and failed
  captures in Settings → Troubleshooting. Nothing about extraction quality.

### 3.2 S2 Brief summary

- **Does:** writes the short summary shown on Today and Feed cards and at the top of the reader.
- **Runs:** on every capture unless `FEATURE_CAPTURE_SUMMARY=false`
  (`src/lib/queue/capture-consumer.ts:39-52`), inside the 60-second capture callback and before
  the capture is marked ready; on Regenerate in the reader (`POST /api/ai/summarize` with `force`,
  60-second cooldown), which the flag does not cover; after a YouTube transcript is loaded. For
  YouTube at capture, only when the description has 200 characters or more. The reader route
  refuses short X posts, but capture summarises every X post, and that brief then replaces the
  post's text on cards (`worker.ts:428`, `src/app/api/ai/summarize/route.ts:33-39`).
- **Code:** `generateSummary`, `prepareSummarySource` and `writeBrief` in
  `src/lib/ai/summarize.ts`. Prompts `briefSummaryPrompt` and `chunkNotesPrompt` in
  `src/lib/prompts/summarize.ts`.
- **Routing**, by estimated tokens (characters ÷ 4) of the readable text (`summarize.ts:306-341`):

  | Size           | Task                                                                                                               | Model in Production                                               |
  | -------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
  | Under 2,000    | `summarize`                                                                                                        | `gemini-3.5-flash-lite`                                           |
  | 2,000 to 8,000 | `summarize-complex`                                                                                                | `claude-sonnet-4-6` (`gemini-3.5-flash` without an Anthropic key) |
  | Over 8,000     | notes per ~4,000-token chunk on `summarize`, three at a time, then the brief over the notes on `summarize-complex` | `gemini-3.5-flash-lite`, then `claude-sonnet-4-6`                 |

- **Prompt (`summary-v2`):** "The reader wants to know, in under a minute, what this piece is and
  what they would get from it." The model first picks a shape (argument, news, how-to, research,
  conversation, meeting-note, product, list, other), each with a hint of what a reader needs. It
  then writes a 1 to 3 sentence overview, at most three sections with headings written for the
  piece (bullets, steps, paragraph or quotes), at most seven items, and 2 to 5 open questions that
  are stored but not shown; the detailed summary answers them. "Use only what is in the content
  and metadata."
- **Output contract:** Gemini response schema plus zod validation; anything over the caps is
  trimmed; the JSON is rendered to markdown and both are stored.
- **Limits:** 15 seconds for `summarize`, 40 for `summarize-complex`, one attempt each. A Gemini
  call that fails on quota, timeout or a server error is retried once on `gemini-3.1-flash-lite`
  (`router.ts:490-521`). An Anthropic call has no fallback and gets its JSON by instruction and a
  regular expression, not a schema (`providers.ts:437-445`).
- **Stores:** `ai_summaries` (markdown, structured JSON, model, `prompt_version`, `content_hash`).
  One row per item and type; Regenerate overwrites it, so there is no history.
- **On failure:** the log event `capture_summary_skipped`; the item keeps its excerpt. Not shown
  in the UI.
- **Measured today:** nothing. No faithfulness or usefulness score; regenerations are not counted.
- **Notes on the prompt:** only the area prompt and the Sonnet system prompt tell the model to
  treat the content as untrusted; the Gemini brief path has no such line. The `Topics` line is
  always "None specified" on hosted captures. The open questions sometimes go to trivia (recorded
  2026-09-29, never fixed), which weakens the detailed summary.

### 3.3 S3 Life area

- **Does:** sorts each item into Personal, Work, Learning or Updates.
- **Runs:** after the brief on every capture unless `FEATURE_AREA_CLASSIFICATION=false`; the
  one-off backfill job uses title and summary only.
- **Code:** `classifyItemArea` in `src/lib/ai/classify-area.ts`; prompt `classifyAreaPrompt` in
  `src/lib/prompts/classify-area.ts`.
- **Model:** task `classify-area`, `gemini-3.5-flash-lite`, 15 seconds, one attempt, no fallback.
- **Prompt (`area-v1`):** the four definitions; up to 20 of the reader's most recent corrections as
  examples; the item's title, capture channel, type, site, author, publication and topics; the
  brief's overview; the first 2,000 characters. It says to treat the item as material and ignore
  instructions in it, to always pick one area, and to return `{area, confidence, reason}`.
- **Stores:** `items.area`, `area_confidence`, `area_reason`, `area_model`, `area_classified_at`.
  The prompt version is not stored. A correction is `manual_area` and always wins.
- **On failure:** log event `capture_area_skipped`; the item waits for the backfill.
- **Measured today:** counts by area and a count of corrections through
  `GET /api/v1/areas/backfill` (no UI). The recorded checks are 7 of 8 synthetic items and "24
  items, 0 failures", which counts errors, not accuracy.
- **Notes:** the confidence is the model's own statement and has never been checked against
  corrections. The definitions name Amit, so an invited colleague's items are classified against
  his life. A correction that later matches the model's answer drops out of the examples.

### 3.4 S4 Today selection and feed ranking

- **Does:** picks Today's six items and orders the Feed.
- **Code:** `TODAY_FEED_QUERY` in `src/lib/feed/today-selection.ts:18-23`; `PostgresFeedQuery.list`
  and `explainFeedRank` in `src/lib/feed/feed-query.ts`; `loadFeedPage` in
  `src/lib/feed/feed-params.ts`.
- **Today's formula** (`sort=priority`, unread, limit 6):
  `score = bucket + 10 × e^(−age in days ÷ 10)`, where bucket is 90 for high, 50 for medium and 20
  for low. A manual priority replaces the bucket with 300, 200 or −100.
- **Where `priority` comes from:** every capture is stored as `medium`
  (`src/lib/capture/schema.ts:12`); the extension sends `medium`. The manual control is behind
  `FEATURE_KNOWLEDGE_UI`. So with no thumbs ratings, every item scores 50 plus recency and Today is
  the six newest unread items. Each card prints the first ranking reason, which reads "Why now:
  Item priority: medium" (`today-selection.ts:40`, `src/components/phase2/today-prototype.tsx:55`).
- **After a thumbs rating** the heuristic in S5 rewrites `priority` for the newest 200 items.
- **Feed default (`for_you`):** uses `ai_priority_score` when set, else the bucket, plus recency.
  With `FEATURE_PERSONALIZATION` and the per-user switch on, it adds an affinity: events on items
  sharing a source type, author, content type or topic, weighted +3 or −3 for feedback, +3 for
  completed, −2 for archived, with a 60-day half-life, and can reserve up to two of the top ten
  for other sources.
- **Three formulas, one job:** the SQL score (`feed-query.ts:417-464`), its JavaScript mirror
  (`explainFeedRank`) and the reprioritize heuristic (`src/lib/ai/prioritize.ts:38-74`). None is
  versioned.
- **Measured today:** nothing. What Today showed is not recorded, and neither is what was opened.

### 3.5 S5 Feedback and preference learning

- **Does:** turns thumbs up and down into a preference profile and new priorities.
- **Path:** the reader's thumbs (`src/components/feed/detail-action-bar-content.tsx:91-106`) post
  to `POST /api/ai/feedback`, which stores a `feedback` row and then, without awaiting it, runs
  `updatePreferencesFromFeedback` and `reprioritize` (`src/app/api/ai/feedback/route.ts:49-59`).
- **Model:** task `preference-analysis`, `gemini-3.5-flash-lite`, plain text.
- **Prompt:** `preferenceAnalysisPrompt` in `src/lib/prompts/prioritize.ts:44-74`, unversioned. It
  lists every rated item as LIKED or DISLIKED with its topics, source type, content type and
  author, and asks for weights between 0 and 1 per topic, source type, author and content type,
  plus a short description of the reader. The answer is parsed with `JSON.parse` and stored
  unvalidated in `user_settings.agent_preferences` (`src/lib/ai/preferences.ts:78-90`).
- **Reprioritize heuristic** (`prioritize.ts:38-74`):
  `(0.7 × recency + 0.9 × topic + 0.6 × source + 0.3 × author + 0.2 × type) ÷ 2.7`, with 50 for
  anything unknown and recency `100 × e^(−age ÷ 10)`; a read item is multiplied by 0.3. A score of
  70 or more is high, 40 or more is medium. It writes `ai_priority_score` and overwrites
  `priority`.
- **What it can learn from:** topics are empty; source type is only the capture channel (`manual`
  or `browser-extension`); content type is article or video. Author is the one real feature.
  Every rating sends every feedback row ever recorded to the model, with no limit.
- **The other loop:** area corrections feed the area prompt (S3). That loop works.
- **Not recorded at all:** opens, reading progress, what Today showed, summary-level feedback,
  regenerations, detailed requests, search queries, dismissals.
- **Measured today:** nothing. The profile is never shown; `GET /api/ai/preferences` has no UI.

### 3.6 S6 Detailed summary

- **Does:** adds a "Going deeper" part under the brief, containing only what the brief left out.
- **Runs:** when the reader asks for Detailed. Generates and stores the brief first when it is
  missing or pre-`summary-v2`.
- **Code:** `writeDetailedDelta` in `src/lib/ai/summarize.ts`; prompt `detailedDeltaPrompt`.
- **Model:** always `summarize-complex`: `claude-sonnet-4-6`, else `gemini-3.5-flash`. 40 seconds,
  one attempt.
- **Prompt (`summary-v2`):** shows the model the source, the brief "the reader has already read"
  and the brief's open questions. It must answer the questions the content answers, add the
  reasoning, evidence, specifics, caveats and counterpoints, never restate a brief point, scale to
  the source, and name in `deepens` what each section expands.
- **Stores:** `ai_summaries` with `structured.briefId`; a detailed row is stale once its brief is
  regenerated (`src/lib/ai/summary-freshness.ts`).
- **Measured today:** `npx tsx evals/run-evals.ts --delta --live`, by hand, on four or five items,
  with deterministic checks: restatement at most 15%, at least three new specifics, specifics
  missing from the source counted as ungrounded. Recorded results are for `gemini-3.5-flash` only;
  the Sonnet output Production serves has never been run through it.
- **Notes:** on a long item the chunk notes are recomputed for the detailed call. Opening Detailed
  on an old long item runs notes, brief and delta in one 60-second request.

### 3.7 S7 Deep research

- **Does:** writes a cited report of at most 2,500 words on a question, optionally seeded by an
  item.
- **Runs:** from the reader or the Research page, as one queue message per stage
  (`src/app/api/queue/research-runs/route.ts`, `src/lib/queue/research-consumer.ts`,
  `runResearchStage` in `src/lib/ai/research.ts`).
- **Stages and models:**

  | Stage                | Task                  | Model                                                                                       | Prompt (`src/lib/prompts/research.ts`)                                     |
  | -------------------- | --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
  | Plan                 | `research-plan`       | `gemini-3.5-flash`                                                                          | `researchPlanPrompt`: 3 to 5 sub-questions chosen by question type         |
  | Search, per question | `research-search`     | `gemini-3-flash-preview` with Google Search grounding; plain call when grounding is refused | `researchNotesPrompt` (grounded and ungrounded variants)                   |
  | Gaps                 | `research-gaps`       | `gemini-3.5-flash`                                                                          | `researchGapsPrompt`: at most two gaps                                     |
  | Deepen, per gap      | `research-search`     | as Search                                                                                   | `researchNotesPrompt`                                                      |
  | Outline              | `research-synthesize` | `claude-sonnet-4-6`, else `gemini-3.5-flash` with low thinking                              | `researchOutlinePrompt`: shape, TL;DR, takeaways, 3 to 4 sections, caveats |
  | Write, per section   | `research-synthesize` | as Outline                                                                                  | `researchSectionPrompt`: one section with per-claim citations              |
  | Assemble             | none                  | rules                                                                                       | citations, source list, word cap                                           |

- **Limits:** 45-second stage deadline inside a 60-second function, one attempt per call, two
  attempts per stage, truncated answers rejected.
- **Stores:** `research_reports` (report, sources, progress). The stored `model` is the plan model,
  not the models that wrote the report.
- **Measured today:** word and source counts on single runs during R1 to R3. No rubric, no repeat
  runs. The prompts are unversioned.
- **Also here:** the research-suggestion scan (`src/lib/agent/proactive-research.ts`) has an inline
  prompt on `research-plan`. It needs topic clusters, so in the hosted product it finds nothing.

### 3.8 S8 Search

- **Does:** filters Feed and Today as you type.
- **Code:** `feedSearchTsQuery` and the search branch of `PostgresFeedQuery.list`.
- **How:** Postgres full-text over title, author, publication, the item's excerpt (`items.summary`,
  at most the capture note, the page description or the first 277 characters) and topics
  (`src/lib/postgres/tenant-migrations/0012_feed_search.sql`). Every term must match and the last
  is a prefix; a literal `ILIKE` on title, author and publication catches half-typed words.
  Relevance is `ts_rank` plus 1 when the typed text is in the title.
- **Not searched:** the article body and the brief. A word that appears only there finds nothing.
  No semantic search.
- **Measured today:** unit tests on query building. No relevance test; queries are not recorded.

### 3.9 S9 Worth revisiting

- **Does:** should show up to three unread items last opened at least 14 days ago.
- **Code:** the `resurface=stale` branch in `feed-query.ts:409-414` and `feed-params.ts:137-146`.
- **State:** the rule needs `items.last_opened_at`, and no code writes that column. The strip is
  always empty.

### 3.10 S10 Knowledge index

- **Does:** on every capture writes a content version, its chunks and an extractive fallback
  summary labelled "Text generation was unavailable" (`src/lib/knowledge/capture-index.ts`).
- **State:** the readers of these tables (Ask Distil, passage retrieval) were removed on
  2026-09-30. The remaining reader is the item intelligence route behind `FEATURE_KNOWLEDGE_UI`,
  which no UI calls.

### 3.11 The call gateway

- **Config:** `src/lib/ai/ai-config.ts` maps ten task names to a provider and model, with a
  per-provider fallback table and list prices. `auto-tag` has no live caller and `prioritize` has
  no UI caller. Grounded research search ignores the `research-search` assignment and always uses
  the `GEMINI_SEARCH_MODEL` constant (`router.ts:334`).
- **Router:** `src/lib/ai/router.ts`. Tenant calls pass a per-user request quota and optional daily
  and 30-day dollar budgets before the call, then write one `audit_log` row and one
  `usage_counters` update after a successful call.
- **Providers:** `src/lib/ai/providers.ts`. Gemini through the `@google/generative-ai` SDK with
  JSON mode and a response schema; Anthropic and OpenAI through their SDKs with JSON by
  instruction.
- **What one call records:** user, task (as `ai:<task>`), provider, model, tokens, estimated cost,
  latency and request id. It does not record the stage (a brief and a detailed summary are both
  `ai:summarize-complex`), the item, the prompt version, attempts, whether the fallback served it,
  or anything at all when the call fails.
- **Logs:** `src/lib/logger.ts` keeps only allowlisted fields and replaces every message, so a log
  line is identified by its `event` field alone. Failed calls exist only as log events
  (`capture_summary_skipped`, `capture_area_skipped`, `summary_failed`, `research_stage_failed`,
  `summary_model_fallback`).

## 4. What exists for evaluation today

| Asset                                      | What it does                                                                                                                                                                                                                                                                                                   | Verdict                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run eval` (dry)                       | Scores six hand-typed predictions against six items of a synthetic set from 2026-03. Prints numbers such as "Priority Accuracy 83.3%".                                                                                                                                                                         | Tests the metric code. Says nothing about the product.                                                           |
| `npm run eval:live`                        | Calls `gemini-2.5-flash` directly with prompts written inside the script, not the product's. That model is recorded as retired (`ai-config.ts:103`), so the run would stop at its first call; not run in this audit. When a later call fails it substitutes the expected label (`evals/run-evals.ts:276-335`). | Cannot run today. When it could, a failed call counted as a correct answer for category and duplicate detection. |
| `evals/golden-set.json`                    | 50 synthetic items of 400 to 600 characters; 40 are Gmail or Slack; labels are six news categories and a priority.                                                                                                                                                                                             | Describes a product that no longer exists. None of the four areas, no real article.                              |
| `npm run eval:nightly`                     | The dry run plus fixed fixtures for retrieval, citations and abstention.                                                                                                                                                                                                                                       | Those features were removed on 2026-09-30. Not scheduled in any workflow.                                        |
| `evals/run-evals.ts --delta --live`        | Runs the real brief and detailed prompts and applies deterministic delta checks.                                                                                                                                                                                                                               | The one real eval. Manual, four or five items, one stage, never on the model Production uses.                    |
| `npm run audit:ai-models`                  | Lists provider catalogues and checks every configured id is callable.                                                                                                                                                                                                                                          | Availability only. Does not notice newer models or shutdown dates.                                               |
| Unit tests on prompts, schemas and metrics | Deterministic.                                                                                                                                                                                                                                                                                                 | Guard structure, not quality.                                                                                    |
| `audit_log`, `usage_counters`              | Successful calls with model, tokens, cost and latency.                                                                                                                                                                                                                                                         | Usable for a health scorecard today (appendix A). No UI shows it.                                                |
| `GET /api/v1/areas/backfill`               | Counts by area and of corrections.                                                                                                                                                                                                                                                                             | The closest thing to a quality number. No UI.                                                                    |

No head-to-head comparison between models has ever been recorded: not Sonnet against Gemini for
summaries, and the 2026-10-01 Jev review was of documentation only. No eval runs in CI.

## 5. Evaluation framework

### 5.1 What good means

The measures come from the product principles already recorded in `docs/project-state.md`:
"summary faithfulness and user-rated usefulness", "feed precision: how often the highest-ranked
items are actually useful", the time from capture to a usable distillation, and cost per processed
item. The Phase 2 quality gates supply the starting thresholds: supported-claim precision of at
least 95%, ranking nDCG of at least 80%, at most $0.02 per item, background work within 45 seconds
at the 95th percentile, and no gated metric regressing more than 5% from the accepted baseline.
Thresholds below marked "proposed" are to be confirmed against the first baseline, not assumed.

### 5.2 Four layers

Each layer answers a different question, and a stage is only covered when all four have an answer.

| Layer              | Question                                        | Source                                                          | Cost                           |
| ------------------ | ----------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| A Health           | Is the stage running, on time and on budget?    | Tables the app already writes, plus per-call stage and status   | No model calls                 |
| B Offline quality  | Is the output good on a fixed, reviewed set?    | Golden sets, deterministic checks, a calibrated judge, pairwise | Cents to a few dollars per run |
| C Online outcomes  | Does the reader act as if it is good?           | Events from real use                                            | No model calls                 |
| D Review and gates | Who looks, how often, and what blocks a change? | A weekly scorecard, a monthly check, a gate on every change     | Minutes of Amit's time         |

### 5.3 Layer A: health

| Metric                     | Definition                                                      | Available now                                    |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Brief coverage             | Ready items with a current-version brief ÷ eligible ready items | Yes                                              |
| Area coverage              | Ready items with an area ÷ ready items                          | Yes                                              |
| Topic coverage             | Items with at least one topic ÷ items                           | Yes (expected near zero)                         |
| Capture outcomes           | Ready, rejected and failed captures by error code               | Yes                                              |
| Call volume, latency, cost | Count, p50, p95 and dollars by task and model                   | Yes, by task; by stage needs a stage id          |
| Admission gap              | Calls admitted minus calls recorded, per day                    | Yes; a proxy for failed calls                    |
| Failure rate by cause      | Failed calls ÷ calls, by stage and error category               | No; failures are only logged                     |
| Fallback rate              | Calls served by the fallback model ÷ calls                      | Partly; inferable from the model on summary rows |
| Cost per capture           | Model cost attributed to one item                               | No; calls carry no item id                       |
| Stale versions             | Stored outputs not on the current prompt version                | Yes for summaries; no for areas                  |

Proposed alarms: brief or area coverage under 95% of eligible items; failures over 2% or fallback
over 5% in a week; cost per capture over $0.02; capture-to-brief over 45 seconds at p95.

### 5.4 Layer B: offline quality, per stage

| Stage          | Cases                                                                                                         | Graders                                                                                                                                | Headline metric (proposed bar)                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| S1 Extraction  | About 30 public URLs across the shapes in `docs/test-links/links.json`, plus about 10 known junk pages        | Rules: expected status, title, minimum length, a phrase that must appear, boilerplate that must not                                    | Good pages accepted 100% (zero false rejects); junk rejected                      |
| S2 Brief       | About 40 items: about 30 public URLs spread over shape and the three size bands, about 10 private items by id | Rules (schema, caps, no preamble, specifics present in the source), then a judge per property, then pairwise against a frozen baseline | Briefs with no unsupported claim (95%); main point captured; pairwise win rate    |
| S6 Detailed    | The longer brief cases                                                                                        | The existing delta checks, plus the faithfulness judge                                                                                 | Delta pass rate; no unsupported claim                                             |
| S3 Area        | Every item in the reader's library after one review pass; about 20 synthetic items as a public smoke set      | Exact match, leave-one-out so an item is never its own example                                                                         | Accuracy and per-area recall (90%), confusion matrix, confidence against accuracy |
| S4 Ranking     | A monthly snapshot of unread items rated must, nice or skip                                                   | Rules: replay each ranking formula over the snapshot                                                                                   | nDCG@6 (0.80); skips in the top six; margin over newest-first                     |
| S5 Preferences | Synthetic feedback histories with a known pattern                                                             | Rules: weights move the right way; ranking moves when feedback is added                                                                | Pass or fail per scenario                                                         |
| S7 Research    | 8 to 10 fixed questions                                                                                       | Rules (every citation resolves, word budget, sections) and a rubric judge                                                              | Citation validity; TL;DR answers the question; completion rate, time and cost     |
| S8 Search      | About 20 queries with the item each should find                                                               | Rules                                                                                                                                  | Recall@5 and mean reciprocal rank                                                 |

Brief properties for the judge, each scored separately as yes or no with the offending text quoted:

1. **Faithful:** every claim in the brief is supported by the source.
2. **Main point:** the overview states what the piece is and its main point.
3. **Specific:** items carry the number, name or step, not a description of it.
4. **Fits the piece:** the shape and the sections suit this piece; nothing is filler.
5. **Under a minute:** a reader could decide whether to read on from the brief alone.

### 5.5 Layer C: online outcomes

| Metric               | Definition                                                                      | Needs                                  |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Today hit rate       | Of the items Today showed on a day, the share opened within 24 hours            | Recording what Today showed, and opens |
| Today misses         | Unread items opened from the Feed that day that Today did not show              | The same                               |
| Today skips          | Items shown on three or more days and never opened                              | The same                               |
| Area correction rate | Items whose area was corrected ÷ classified items, by confidence band and model | Nothing; available now                 |
| Regenerate rate      | Regenerations ÷ briefs viewed                                                   | An event on Regenerate                 |
| Detailed rate        | Detailed summaries requested ÷ items opened                                     | Opens                                  |
| Summary reports      | "This summary is off" with a reason (wrong, misses the point, vague, too long)  | A control on the summary               |
| Thumbs               | Up and down counts                                                              | Nothing; available now                 |
| Research completion  | Runs completed ÷ started; time; whether the report was opened                   | Mostly available                       |

The Phase 2 contract says raw dwell time is not a ranking signal. These are measures of outcome.
Whether any of them later becomes a ranking input is a separate product decision.

### 5.6 Layer D: review and gates

- **Weekly scorecard.** A card in Settings → Troubleshooting shows layers A and C with the change
  since last week.
- **Monthly check, about 15 minutes.** Amit blind-grades ten recent briefs, rates one Today
  snapshot, and looks at the area corrections. The grades also re-calibrate the judge.
- **Change gate.** A change to a prompt, a model id, a routing threshold or a ranking constant
  bumps the version, runs that stage's suite against the frozen baseline, and records the result
  in the pull request and the state log. A unit test fails when a prompt's text changes without its
  version constant.
- **Regression rule.** No gated metric may regress more than 5% from the accepted baseline. For a
  yes-or-no metric the noise floor is about `1 ÷ √(cases × repeats)`, which is ±11 points for 40
  cases run twice, so the gate uses paired and pairwise comparisons and states the noise floor
  beside every number.
- **Model watch.** Monthly; see §6.

What a red metric triggers:

| Signal                                                       | Action                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Area correction rate over 10%, or an area's recall under 80% | Revise the definitions and examples; then reconsider the classifier model (the recorded Jev trigger) |
| Brief faithfulness under 95%                                 | Read the failures; fix the prompt or move that size band up a model tier                             |
| A brief with specifics that are not in the source            | Flag the item; regenerate on the stronger model                                                      |
| Today hit rate no better than newest-first                   | Revert the ranking change                                                                            |
| Failures over 2% or fallback over 5%                         | Check provider quota, billing and timeouts                                                           |
| Cost per capture over $0.02                                  | Check routing and long-document handling                                                             |

### 5.7 Cases and labels

- **Public cases** are stored in the repository as URLs with their expectations, like
  `docs/test-links/links.json`. Article text is fetched at run time and cached only in an ignored
  directory.
- **Private cases** (meeting notes, anything captured) are stored as item ids. The runner reads
  the content from the reader's own tenant at run time. Labels live in the database or an ignored
  file. Result files hold metrics and ids only, as the delta check already does. No captured
  content enters git.
- **Labels come from Amit**, and his time is the scarce input. One-time: about 15 minutes to scan
  each area's list and fix the outliers, about 30 minutes to grade 20 briefs as good or bad with a
  reason, about 10 minutes to rate one snapshot of unread items. Then the monthly check.
- **Small numbers.** The Production library is a few dozen items. A 30-item set cannot resolve
  differences under about 18 points on a yes-or-no metric. The sets grow with use; until then,
  results are reported with their interval and backed by the public sets.

### 5.8 Graders

1. **Rules first.** Schema, caps, grounding of numbers and names, citation resolution. Free, and
   the same checks run in production on every output as guards (§5.9).
2. **A model judge for what rules cannot see.** One property per call, structured output, the
   candidate text treated as data. The judge is not the model under test; when candidates from
   two providers are compared, a second judge from the other provider also scores and
   disagreements go to Amit.
3. **Calibration.** Before a judge's scores steer anything, it is run on the briefs Amit graded.
   Agreement well under 90% on clear cases means the rubric is not ready.
4. **Pairwise for changes.** For a model or prompt change, the judge sees the source and two
   briefs in random order, may answer tie or both bad, and the baseline outputs are frozen on disk.

### 5.9 Harness rules

- A suite calls the product's own prompt builders and router. It never re-types a prompt.
- A failed call, a timeout or a cut-off answer is recorded as an error, never as a score of zero
  and never replaced by the expected answer.
- Before the first paid run, the reference answers must score near 100% and an empty output near
  0%.
- Every case keeps its full exchange and the judge's reasoning, outside git.
- The model named in the response is checked against the model requested.
- Tokens and cost come from the provider's usage, per case, with the judge's cost separate.
- Results carry the number of cases, the repeats and the interval.
- **Guards in production.** The rule-based checks also run when an output is generated and store
  their result with it: specifics not found in the source, caps exceeded, fallback used,
  truncation. They give a quality signal on every real output at no model cost.

### 5.10 Cadence

| When                                   | What runs                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Every pull request                     | Deterministic tests, including the prompt-version guard and the metric unit tests |
| A change to a prompt, model or formula | That stage's suite against the frozen baseline (the change gate)                  |
| Nightly                                | A small public smoke subset per model-backed stage, to catch provider drift       |
| Weekly                                 | The full suites and the scorecard                                                 |
| Monthly                                | Amit's check, the model watch, a research suite run                               |

## 6. Model policy

### 6.1 Assignments and list prices

Prices are dollars per million input and output tokens, from `MODEL_COSTS` in
`src/lib/ai/ai-config.ts` (checked there on 2026-09-29).

| Task                             | Used by                              | Model                    | Price                                    |
| -------------------------------- | ------------------------------------ | ------------------------ | ---------------------------------------- |
| `summarize`                      | Brief under 2k tokens; chunk notes   | `gemini-3.5-flash-lite`  | 0.30 / 2.50                              |
| `summarize-complex`              | Brief over 2k tokens; detailed       | `claude-sonnet-4-6`      | 3.00 / 15.00                             |
| `classify-area`                  | Life area                            | `gemini-3.5-flash-lite`  | 0.30 / 2.50                              |
| `preference-analysis`            | Preference profile                   | `gemini-3.5-flash-lite`  | 0.30 / 2.50                              |
| `research-plan`, `research-gaps` | Research plan, gaps, suggestion scan | `gemini-3.5-flash`       | 1.50 / 9.00                              |
| `research-search`                | Research search and deepen           | `gemini-3-flash-preview` | 0.50 / 3.00, plus $14 per 1,000 searches |
| `research-synthesize`            | Research outline and sections        | `claude-sonnet-4-6`      | 3.00 / 15.00                             |
| `prioritize`, `auto-tag`         | No live caller                       | `gemini-3.5-flash-lite`  | 0.30 / 2.50                              |
| Summary fallback                 | Gemini summary calls that fail       | `gemini-3.1-flash-lite`  | 0.25 / 1.50                              |

At a few captures a day, cost does not decide the tier. A brief of a 1,500-word article is about
2,700 input and 500 output tokens: roughly $0.002 on `gemini-3.5-flash-lite` and $0.014 on
`claude-sonnet-4-6` (estimates from list prices, before thinking tokens). Ten captures a day on the
dearer model is about 14 cents. Quality, latency inside the 60-second function, and reliability
decide.

### 6.2 What a currency check found on 2026-10-01

Anthropic facts are from Anthropic's current model reference. Gemini facts are from Google's model,
pricing and deprecation pages as fetched on 2026-10-01 through a summarising tool; confirm them
with the provider catalogue before acting.

- `claude-sonnet-4-6` is two releases behind. `claude-sonnet-5-5` is the current Sonnet at 2.00 /
  10.00, so it is cheaper per token. It is not a one-line swap: it thinks by default and thinking
  counts against `max_tokens` (the research write budget is 2,000), it rejects a non-default
  temperature, it can stop with a refusal reason the provider code does not read, and it supports
  a JSON schema directly, which would replace the instruction-and-regex path.
- Google lists `gemini-3.8-flash` (released 2026-09-02) above `gemini-3.5-flash`, priced at 0.75 /
  3.75 until the end of 2026. Nothing in the config references it.
- `gemini-3.1-flash-lite`, the summary fallback, has a listed shutdown date of 2027-05-07.
- `gemini-3-flash-preview`, the grounded search model, is a preview with a named successor.
- The `@google/generative-ai` SDK was deprecated on 2025-11-30 in favour of `@google/genai`. The
  provider code already works around its missing types for thinking and search grounding.
- `gpt-4o` and `gpt-4o-mini` in the OpenAI fallback table are old. Nothing routes to OpenAI.
- The state log describes the Production Gemini key as free-tier (last on 2026-09-30). Google's
  terms for unpaid use allow it to use submitted content to improve its products and to have human
  reviewers read it, and say not to submit confidential or personal information. The current
  billing state was not checked in this audit.

### 6.3 Tiers and the swap rule

| Tier     | Stages                                                         | Rule                                                            |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Quality  | Brief, detailed, research outline and sections, the eval judge | The best model that fits the latency limit, proven on the suite |
| Balanced | Chunk notes, research plan and gaps                            | Mid tier; revisit when the long-document brief score is low     |
| Economy  | Life area, preference profile, any future triage call          | The cheapest model that clears the bar on the suite             |

A model changes only through the change gate: run the incumbent and the candidate on the stage's
suite, pairwise and blind, with cost and latency beside quality. Adopt when the candidate is not
worse within the noise floor and is cheaper or faster, or is better by more than the noise floor at
an acceptable cost. Record the result in the state log. Without a suite for the stage, do not swap.

### 6.4 Model watch, monthly

1. Run `npm run audit:ai-models`, extended to list models newer than the configured ones and any
   shutdown dates.
2. Pick at most one candidate per tier.
3. Run the affected suites, incumbent against candidate.
4. Record the decision, including "no change".

## 7. Target shape of the code

Today a stage is defined in five places: the prompt and its version in `src/lib/prompts/`, the
schema, caps, timeouts and size thresholds in `src/lib/ai/*.ts`, the model in `ai-config.ts`, the
fallback as a special case inside the router (`router.ts:495-501`), and a provider-level system
prompt for Sonnet only (`providers.ts:398-406`). A task name does not identify a stage, and
unreachable code sits beside live code.

The target is one manifest and one rule:

- **A stage manifest** (for example `src/lib/ai/stages.ts`) lists each stage once: id, what it is
  for, where it shows, what triggers it, its prompt builder and version, its model task or routing
  rule, its tier, its limits and fallback, and its eval suite.
- **Every model call names its stage.** The router takes the stage id, the item id and the prompt
  version, and writes them with the status of the call, success or failure.
- **One task per stage** where the model may differ, so the brief, the chunk notes and the detailed
  summary can be tuned and measured apart.
- **The map is generated.** A command prints §1 and the prompt index from the manifest, so this
  file's tables stop being typed by hand.
- **A stage without a suite fails a test**, unless the manifest says why it has none.
- **One ranking module** holds the constants for the SQL score, its explanation and any heuristic,
  under a version, so a ranking can be replayed offline against a rated snapshot.
- **Unreachable code is removed** or moved out of the live tree, so what is in `src/lib/ai/` is
  what runs.

## 8. Findings

Severity: **A** changes what the reader sees or risks their data now; **B** hides a problem or
blocks improvement; **C** tidiness.

### Ranking and signals

1. **A. Today has no ranking signal.** Every capture is `medium` and nothing scores it, so Today
   is the six newest unread items, each labelled "Why now: Item priority: medium" (§3.4). Recorded
   in the backlog on 2026-10-01; the "plus feedback affinity" in that entry does not apply to
   Today, which sorts by `priority` and never adds affinity.
2. **A. "Worth revisiting" can never fill.** No code writes `items.last_opened_at` (§3.9).
3. **A. One thumbs rating rewrites every priority.** `reprioritize` overwrites `priority` on the
   newest 200 items. With neutral preferences the best possible score is 63, so nothing becomes
   high, and an unread item falls to low after about 22 days. A learned source weight applies to
   the capture channel, so liking one article saved with the extension lifts everything saved
   with the extension (§3.5).
4. **B. The affinity loop is unfed.** The feed's personalization sums `feedback_recorded`,
   `completed` and `archived` events. The thumbs route writes the `feedback` table and no event;
   no UI sends reading progress; archive is behind `FEATURE_KNOWLEDGE_UI`
   (`feed-query.ts:426-454`).
5. **B. Reads are not events.** Mark-read in the reader, on cards and on the `r` key calls the
   legacy `PATCH /api/items/[id]`, which sets `is_read` only: no `read_at`, no event.
6. **B. Preference learning is fragile and blind.** The background work after a rating is not
   awaited and not wrapped in `after()`, so a serverless function may stop before it finishes; the
   model's answer is parsed with `JSON.parse` on free text and stored unvalidated; the features it
   learns from are empty topics and the capture channel; the profile is never shown.
7. **B. No topics.** The only tagger is in the disabled connector pipeline, so topics are empty on
   hosted captures. Five consumers depend on them (§1).

### Measurement

8. **B. No quality measurement on any live stage,** and no model comparison on record (§4).
9. **B. `npm run eval:live` tests prompts the product does not use, on a retired model, and counts
   a failed call as a correct answer** for category and duplicate detection (§4).
10. **B. Failed model calls leave no row.** Only successes reach `audit_log`. A call cannot be
    tied to an item, a stage or a prompt version (§3.11).
11. **B. Nothing records what Today showed or what was opened,** so feed precision cannot be
    computed (§5.5).
12. **C. The area prompt version is not stored** with the classification, and regenerating a
    summary destroys the previous one, so before-and-after comparisons need a separate record.

### Reliability and data handling

13. **A, to confirm. Gemini free tier.** If the Production key is still unpaid, captured content,
    including Work items, is covered by terms that permit product-improvement use and human review
    (§6.2). The free tier's request caps would also limit eval runs.
14. **B. No fallback for Anthropic-routed calls.** A timeout or overload on a brief over 2k tokens
    leaves the item without a brief; the capture retry does not run enrichment again (§3.1, §3.2).
15. **B. YouTube on Production has no description, transcript or brief** (recorded 2026-09-20,
    undecided).
16. **B. The privacy switches do nothing.** "Allow AI processing" and "Personalize my brief" in
    the account centre are stored and never read by capture, summaries or ranking.

### Coverage and consistency

17. **B. Search does not look inside the article or the brief.** It indexes the title, author,
    publication, a short excerpt and topics (§3.8).
18. **C. Research suggestions cannot work as built.** They need topics; and
    `research_suggestions` has a check that `source_item_ids` is empty while the code inserts ids
    (static reading, not executed).
19. **C. Short X posts are summarised at capture** although the reader refuses to summarise them,
    and the brief replaces the post's text on cards (§3.2).
20. **C. The area definitions name Amit,** so they are wrong for invited colleagues.
21. **C. No untrusted-content line on the Gemini summary path** (§3.2).

### Models and documents

22. **B. The model list is behind** and nothing notices: a newer, cheaper Sonnet and a newer
    Flash exist; a fallback has a shutdown date; the Gemini SDK is deprecated (§6.2).
23. **C. Documents have drifted.** `AGENTS.md` said the router had a circuit breaker (deleted on
    2026-09-17) and that summaries use 15-second timeouts (the larger task uses 40).
    `src/lib/postgres/schema.ts` lacks the seven life-area columns. `docs/agent-architecture.md`
    describes removed agents.

## Appendix A: scorecard queries

Read-only, counts only. Run inside a tenant transaction (row-level security is forced). Checked
for syntax against the local schema on 2026-10-01.

```sql
-- A1 coverage
SELECT count(*) FILTER (WHERE i.processing_status = 'ready') AS ready,
       count(*) FILTER (WHERE i.processing_status = 'rejected') AS rejected,
       count(*) FILTER (WHERE i.processing_status = 'ready' AND b.item_id IS NOT NULL) AS with_brief,
       count(*) FILTER (WHERE i.processing_status = 'ready' AND i.area IS NOT NULL) AS with_area,
       count(*) FILTER (WHERE jsonb_array_length(i.topics) > 0) AS with_topics,
       count(i.ai_priority_score) AS with_ai_score,
       count(i.manual_priority) AS manual_priority,
       count(i.last_opened_at) AS ever_opened
FROM items i
LEFT JOIN ai_summaries b
  ON b.user_id = i.user_id AND b.item_id = i.id AND b.prompt_type = 'brief';

-- A2 priority buckets
SELECT priority, count(*) FROM items WHERE processing_status = 'ready' GROUP BY 1 ORDER BY 2 DESC;

-- A3 summaries by type, model and prompt version
SELECT prompt_type, model, coalesce(prompt_version, '(none)') AS prompt_version, count(*)
FROM ai_summaries GROUP BY 1, 2, 3 ORDER BY 1, 4 DESC;

-- A4 areas and corrections
SELECT coalesce(area, '(none)') AS ai_area, count(*) AS items,
       count(*) FILTER (WHERE manual_area IS NOT NULL AND manual_area IS DISTINCT FROM area) AS corrected,
       round(avg(area_confidence)::numeric, 2) AS mean_confidence
FROM items WHERE processing_status = 'ready' GROUP BY 1 ORDER BY 2 DESC;

-- A5 confidence against corrections
SELECT width_bucket(area_confidence, 0, 1, 5) AS band, count(*) AS items,
       count(*) FILTER (WHERE manual_area IS NOT NULL AND manual_area IS DISTINCT FROM area) AS corrected
FROM items WHERE area IS NOT NULL GROUP BY 1 ORDER BY 1;

-- A6 model calls in the last 30 days
SELECT action, model, count(*) AS calls,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
       round(sum(cost)::numeric, 4) AS usd
FROM audit_log
WHERE action LIKE 'ai:%' AND created_at > now() - interval '30 days'
GROUP BY 1, 2 ORDER BY 1, 3 DESC;

-- A7 calls admitted against calls recorded, per day (the gap is failed or cut-off calls)
SELECT u.billing_date, sum(u.request_count) AS admitted,
       (SELECT count(*) FROM audit_log a
         WHERE a.user_id = u.user_id AND a.action LIKE 'ai:%'
           AND (a.created_at AT TIME ZONE 'UTC')::date = u.billing_date) AS recorded
FROM usage_counters u
WHERE u.operation = 'ai.requests'
GROUP BY u.user_id, u.billing_date ORDER BY 1 DESC LIMIT 30;

-- A8 capture outcomes
SELECT status, coalesce(last_error_code, '-') AS code, count(*)
FROM capture_requests GROUP BY 1, 2 ORDER BY 3 DESC;

-- A9 behaviour signals
SELECT event_type, count(*) FROM item_events GROUP BY 1 ORDER BY 2 DESC;
SELECT rating, count(*) FROM feedback GROUP BY 1;
```

## Appendix B: prompt index

| Prompt                                                                                                               | File                                        | Version               | Stage                   | Live  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------- | ----------------------- | ----- |
| `briefSummaryPrompt`                                                                                                 | `src/lib/prompts/summarize.ts`              | `summary-v2`          | S2                      | Yes   |
| `chunkNotesPrompt`                                                                                                   | `src/lib/prompts/summarize.ts`              | none                  | S2, S6 (long documents) | Yes   |
| `detailedDeltaPrompt`                                                                                                | `src/lib/prompts/summarize.ts`              | `summary-v2`          | S6                      | Yes   |
| `classifyAreaPrompt`                                                                                                 | `src/lib/prompts/classify-area.ts`          | `area-v1`             | S3                      | Yes   |
| `preferenceAnalysisPrompt`                                                                                           | `src/lib/prompts/prioritize.ts`             | none                  | S5                      | Yes   |
| `researchPlanPrompt`                                                                                                 | `src/lib/prompts/research.ts`               | none                  | S7                      | Yes   |
| `researchNotesPrompt`                                                                                                | `src/lib/prompts/research.ts`               | none                  | S7                      | Yes   |
| `researchGapsPrompt`                                                                                                 | `src/lib/prompts/research.ts`               | none                  | S7                      | Yes   |
| `researchOutlinePrompt`                                                                                              | `src/lib/prompts/research.ts`               | none                  | S7                      | Yes   |
| `researchSectionPrompt`                                                                                              | `src/lib/prompts/research.ts`               | none                  | S7                      | Yes   |
| Suggestion scan (inline)                                                                                             | `src/lib/agent/proactive-research.ts`       | none                  | S7                      | Inert |
| Sonnet system prompt (inline)                                                                                        | `src/lib/ai/providers.ts`                   | none                  | Any Sonnet call         | Yes   |
| `prioritizePrompt`                                                                                                   | `src/lib/prompts/prioritize.ts`             | none                  | none                    | No    |
| Grounded summary (inline)                                                                                            | `src/lib/knowledge/intelligence-runtime.ts` | `grounded-summary-v1` | none                    | No    |
| `classifyContentPrompt`, `extractContentPrompt`, `analyzeContentPrompt`, `enrichSummaryPrompt`, `enrichTopicsPrompt` | `src/lib/prompts/intelligence.ts`           | none                  | Connector pipeline      | No    |
