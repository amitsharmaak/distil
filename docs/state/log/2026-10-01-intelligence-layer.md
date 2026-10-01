---
topic: intelligence-layer
title: Intelligence layer audited; evaluation framework and plan Q0–Q8 recorded
date: 2026-10-01
time: 08:49
status: planned
branch: claude/distil-intelligence-audit-5ed2f0
---

## What changed

Docs only, no code. Amit asked on 2026-10-01 for a deep dive on every intelligence stage, ranked
by importance and complexity, with the prompts and models each uses, and for a framework to judge
how each stage is doing, so that the layer becomes thorough, continuously evaluated, current on
models, and legible enough for him to steer.

- New `docs/intelligence-layer.md`: the stage map, the priority and complexity ranking, one card
  per stage (prompt, model, limits, storage, what is measured), what exists for evaluation today,
  the four-layer evaluation framework, the model policy, the target shape of the code, 23 numbered
  findings, the scorecard queries and a prompt index. It is a living reference; this entry holds
  the plan.
- `AGENTS.md`: points at the new file; drops the claim of a router circuit breaker (deleted on
  2026-09-17); notes the 40-second timeout of `summarize-complex`; says what `npm run eval`
  really scores.
- `docs/agent-architecture.md`: its header note points at the new file.

This plan pulls forward the AI-quality part of roadmap Phase 7 ("continuously run … AI-quality
evaluations with regression alerts") at Amit's request. Each phase below still needs his
go-ahead; nothing here authorises a migration, a deploy or a paid model run.

### Headline findings (full list in `docs/intelligence-layer.md` §8)

1. **Today has no ranking signal.** Every capture is stored as `medium` and nothing scores it, so
   Today is the six newest unread items, each labelled "Why now: Item priority: medium".
2. **The learning loop is mostly disconnected.** No code records an open, so "Worth revisiting"
   can never fill. Mark-read bypasses the event path. Thumbs write the `feedback` table but not
   the `feedback_recorded` event the feed's personalization reads. Hosted captures get no topics.
3. **One thumbs rating rewrites every priority** through a heuristic that learns from the capture
   channel, cannot produce `high` with neutral preferences, and demotes unread items to `low`
   after about 22 days. The backlog note of 2026-10-01 that nothing sets `ai_priority_score` is
   therefore not quite right: this path does.
4. **Nothing measures quality on any live stage,** and no model comparison is on record.
   `npm run eval` scores six hand-typed fixtures. `npm run eval:live` uses its own prompts on a
   retired model and substitutes the expected answer when a call fails. No eval runs in CI.
5. **A model call cannot be tied to a stage, an item or a prompt version, and failed calls leave
   no row.** What Today showed is not recorded either, so feed precision cannot be computed.
6. **To confirm: the Production Gemini key is recorded as free-tier.** Google's terms for unpaid
   use allow product-improvement use and human review of submitted content.
7. **The model list is behind.** `claude-sonnet-5-5` is cheaper per token than the
   `claude-sonnet-4-6` in use; Google lists a newer `gemini-3.8-flash`; the summary fallback model
   has a shutdown date; the Gemini SDK in use is deprecated. Nothing would have noticed.
8. **Smaller gaps:** no fallback for Anthropic-routed briefs; search does not look inside the
   article or the brief; the two privacy switches in the account centre are never read; YouTube
   items on Production have no brief (open since 2026-09-20).

### Priority and complexity, in one line each

Today's ranking (critical, hard) · brief summary (critical, medium to hard) · extraction and its
gate (critical, medium) · feedback and learning (high, medium to hard) · life area (medium, easy)
· detailed summary (medium, medium) · search (medium, easy) · deep research (lower, hardest) ·
revisiting and the knowledge index (low, easy).

## The plan

Nine phases. Each is one task and one pull request. Re-verify every file and line reference
against current `main` when a phase starts. The smallest slice that ends the blindness is Q0, Q1,
Q3 and Q4; Q5 is where Today visibly improves.

### Q0. Scorecard from what is already stored (small)

- **Goal:** first real numbers for health, corrections and thumbs, readable by Amit in the app.
- **Scope:** an admin-only route returning counts only (queries A1 to A9 in appendix A of
  `docs/intelligence-layer.md`) and an "Intelligence" card in Settings → Troubleshooting. No
  migration. New repository reads in `src/lib/repositories/ports.ts` and
  `src/lib/postgres/repositories.ts`; the route beside `src/app/api/v1/admin/`; an entry in
  `docs/authorization-matrix.json` with its adversarial tests.
- **Tests:** unit for the mapping, PostgreSQL integration for the queries, a security test that a
  non-admin gets 404.
- **Verify:** on the local loop with seeded items; on Production after Amit's go-ahead to merge.
- **Record:** the first baseline in this topic, counts only.

### Q1. Attribute every call and record what the reader does (medium, has a migration)

- **Goal:** every model call carries its stage, item, prompt version and outcome; opens, reads,
  ratings and what Today showed become events.
- **Scope:**
  - Tenant migration (next free number): `audit_log` gains `stage`, `item_id`, `prompt_version`,
    `status`, `error_category`, `fallback`, `attempts`; `items` gains `area_prompt_version`; the
    `item_events` type check gains `today_shown`, `summary_regenerated`, `detailed_requested`.
  - `src/lib/ai/router.ts`: calls take `{stage, itemId, promptVersion}`; a failed call writes a
    row with its error category. No prompt or content in any row.
  - Reader: record `opened` and `last_opened_at` from the client after mount, not during server
    render, so a link prefetch does not count as an open.
  - Mark-read in `detail-action-bar-content.tsx`, `mark-read-button.tsx` and `feed-list.tsx`
    moves to `PATCH /api/v1/items/[id]/state`, which already sets `read_at` and emits the event.
  - `POST /api/ai/feedback` appends `feedback_recorded` with the rating.
  - Today records `today_shown` once per item per day with its position, using `event_key` for
    idempotency.
- **Behaviour that changes, to confirm first:** "Worth revisiting" starts to fill 14 days after
  items are opened; if `FEATURE_PERSONALIZATION` is on in Production, feedback starts to move the
  `for_you` order. Read the Production flag values before starting.
- **Tests:** router unit tests for failure rows, reader-service tests, two-tenant isolation tests
  for the new writes, migration invariants. Label the PR `full-ci`.
- **Verify:** on the local loop, force a provider error and see the failure row; open an item and
  see the events; the Q0 card shows failures by stage.
- **Needs from Amit:** authorisation for the Production migration and the merge.

### Q2. One manifest, live code only, an honest evals folder (medium, no behaviour change)

- **Goal:** one place that says what each stage is; nothing unreachable beside live code; no eval
  that can mislead.
- **Scope:**
  - `src/lib/ai/stages.ts`: each stage once, with its prompt builder and version, model routing,
    tier, limits, fallback and eval suite. One model assignment per stage, so the brief, the chunk
    notes and the detailed summary can be tuned apart. The summary fallback and the Sonnet system
    prompt move out of `router.ts` and `providers.ts` into the stage's config.
  - `npm run ai:map` prints the stage table and prompt index; a test keeps
    `docs/intelligence-layer.md` §1 and appendix B in step with it.
  - A snapshot test fails when a prompt's text changes without its version constant. The
    unversioned prompts (preferences, research, chunk notes) get versions.
  - `src/lib/feed/ranking.ts`: the constants of the SQL score and `explainFeedRank` under
    `rank-v1`, unchanged in value.
  - Remove, per decision 6: the `useAI` path and `/api/ai/prioritize`, the grounded summary
    runtime, the agent stubs, orphan components, the legacy live mode and synthetic set in
    `evals/`, and the nightly fixtures for removed features. Keep the delta check.
  - Add the life-area columns to `src/lib/postgres/schema.ts`.
- **Tests:** `npm run check`; authorization-matrix entries leave with their routes.

### Q3. Eval harness, with the area and extraction suites (medium, first paid runs)

- **Goal:** a runner that meets the rules in `docs/intelligence-layer.md` §5.9, and two suites
  graded by rules alone.
- **Scope:**
  - `evals/lib/`: case loading, repeats, rows written as each case finishes, an errors file kept
    apart from scores, full exchanges in an ignored directory, intervals and the noise floor, a
    self-test with reference answers and empty outputs, a check that the model served is the
    model asked for, cost from provider usage.
  - Area suite: about 20 public synthetic cases written with Amit, five per area including the
    known boundary (general advice about doing a job well is Learning); and the reader's own
    library by item id, with leave-one-out examples. Output: accuracy, recall and precision per
    area, the confusion matrix, confidence against accuracy, and the same run without examples to
    show whether the correction loop helps.
  - Extraction suite: `docs/test-links/links.json` grown to about 30 good pages and 10 junk pages
    with expectations; live fetch, opt-in; rules only.
- **Needs from Amit:** about 15 minutes to scan each area's list and fix the outliers; sign-off on
  the case lists; go-ahead for the first paid run, from a key with billing enabled.
- **Record:** the first accuracy and extraction numbers in this topic.

### Q4. Brief suite, judge calibration, first model decisions (large)

- **Goal:** a trusted quality number for the brief and the detailed summary, then use it.
- **Scope:**
  - About 30 public URLs spread over the nine shapes and three size bands, plus about 10 private
    items by id. Source text cached only in an ignored directory.
  - Rules shared with production: schema, caps, no preamble, numbers and names present in the
    source, no empty sections.
  - Judge: one call per property (faithful, main point, specific, fits the piece, under a
    minute), structured output, candidate text treated as data.
  - Calibration: Amit grades 20 briefs good or bad with a reason. The judge is not trusted until
    it agrees on about 90% of the clear cases.
  - Freeze the current outputs as the baseline.
  - Comparisons to run, pairwise and blind, each with cost and latency: short briefs on
    `gemini-3.5-flash-lite` against `gemini-3.8-flash` and `claude-sonnet-5-5`;
    `claude-sonnet-4-6` against `claude-sonnet-5-5` for long briefs and detailed (needs provider
    work: effort, a larger `max_tokens`, schema output, the refusal stop reason); the
    open-questions wording recorded on 2026-09-29; an untrusted-content line; a Gemini fallback
    for Anthropic-routed calls.
  - Store the rule results with every brief generated in production.
- **Needs from Amit:** about 30 minutes of grading; sign-off on cases and rubric; go-ahead for
  spend. Measure cost on a five-case pilot first and show the arithmetic.

### Q5. Today: define it, label it, then score captures (large, has a migration)

- **Goal:** Today ranks by something better than recency, shown on Amit's own ratings.
- **Scope:**
  - With Amit, two or three sentences on what belongs in Today. That text is the labelling rule.
  - A snapshot of unread items rated must, nice or skip, stored privately.
  - Replay: `rank-v1` and newest-first as baselines; nDCG@6 and skips in the top six.
  - The capture triage call from the 2026-10-01 backlog: one structured call on the economy tier
    returning whether the page is the real article, topics, a priority score and a one-line
    reason. The junk check runs before the brief; topics fill `items.topics`; the score fills
    `ai_priority_score`; Today sorts by it; the reason replaces "Item priority: medium".
  - Judge the junk flag on Q3's junk set (zero false rejects), topics on a labelled subset, the
    score by replay.
- **Keep:** the Phase 2 contract. Explainable, manual priority absolute, nothing permanently
  hidden, a chronological escape hatch.

### Q6. Repair the learning loop (medium)

- **Scope:** run the work after a rating inside `after()`; parse the profile with a schema; drop
  the capture channel as a feature; cap the feedback rows sent; show the profile in Settings with
  a reset; add a "this summary is off" control with a reason; make the two privacy switches do
  what they say; stop `reprioritize` overwriting `priority` (decision 8); decide
  `FEATURE_PERSONALIZATION`.
- **Verify:** the preference scenarios in §5.4 and the Q5 replay.

### Q7. Continuous runs and the model watch (medium)

- **Scope:** a scheduled workflow running a nightly smoke subset and the weekly full suites on
  public cases, with provider keys as CI secrets, opening an issue on a regression past the gate
  as the nightly full gate does; the scorecard gains the outcome metrics and week-on-week change;
  `npm run audit:ai-models` also lists newer models and shutdown dates; the monthly model watch
  recorded in this topic; the Gemini provider moves to `@google/genai` behind the suites.
- **Optional:** run a challenger model in shadow on every capture and judge the pairs weekly.

### Q8. Research and search suites (medium, last)

- **Scope:** 8 to 10 fixed research questions with rules (every citation resolves, word budget)
  and a rubric, run monthly; about 20 search queries with the item each should find; then decide
  whether search should index the article body and the brief, and measure the gain.

## Decisions for Amit

Option A is the recommendation in each.

1. **Gemini billing.** A: confirm or enable billing on the Production Google AI project before
   anything else. B: stay on the free tier and accept its terms and request caps.
2. **Scorecard (Q0).** A: an admin card in Settings → Troubleshooting. B: a script Amit runs with
   the Production environment.
3. **Labelling time.** A: about an hour once (areas, 20 briefs, one Today snapshot) and about 15
   minutes a month. B: no labels; rules and an uncalibrated judge only.
4. **Private items in evals.** A: allowed by item id, read from Amit's tenant at run time, nothing
   captured written to git. B: public URLs only.
5. **Judge model.** A: `claude-opus-5-5`, plus a Gemini Pro second judge only when models from two
   providers are compared. B: `claude-sonnet-5-5` alone. Either way the judge is never the model
   under test.
6. **Unreachable code (Q2).** A: delete the unreachable AI code and the synthetic eval set; leave
   the connector pipeline in place. B: also delete the connector pipeline. C: keep everything.
7. **Scheduled evals (Q7).** A: GitHub Actions with provider keys as secrets, public cases only.
   B: local runs only.
8. **Thumbs rewriting `priority`.** A: stop it in Q1 and keep writing `ai_priority_score` only.
   B: leave it until Q5.

Closed items this plan respects and does not reopen: Jev (its revisit trigger, the area
correction rate, becomes a tracked metric), summary depth on demand (S3), the research-notes
drill-down (R4), the `content_hash` cache key, removing `OPENAI_API_KEY`, Ask Distil.

## Verification

Locally verified, at `5fe4369`:

- Every claim in `docs/intelligence-layer.md` comes from reading the code. Three read-only sweeps
  (call-site liveness, signals and telemetry, decision history) were cross-checked by hand on
  their main claims: no writer of `last_opened_at`, `opened` or `feedback_recorded`; the mark-read
  path; the feedback route; the logger allowlist; the search vector definition; the missing
  life-area columns in `schema.ts`; the privacy switches.
- `npm run eval:nightly` and `npx tsx evals/run-evals.ts --delta` were run in their offline
  modes to see what they report (six fixtures; two recorded delta cases).
- The appendix A queries were checked for syntax against the local schema.
- `npm run state:check` and Prettier pass on the changed files.

Not verified:

- No paid model call was made and no eval was run live.
- Production was not read: flag values, the Gemini billing state, item and correction counts and
  real failure rates are unknown. The shared local database holds no items, so there was no local
  baseline either.
- Whether the background preference update completes on Vercel, and whether the
  `research_suggestions` constraint rejects rows at run time, are from reading only.
- Anthropic model facts are from Anthropic's current model reference. Gemini model, price and
  shutdown facts are from Google's pages fetched on 2026-10-01 through a summarising tool; confirm
  them with `npm run audit:ai-models` and the provider console before acting.

Noticed outside this audit, unverified: `/api/queue/account-lifecycle` is absent from the proxy
bypass lists that name the other two queue callbacks (`src/proxy.ts`, `src/lib/middleware/auth.ts`,
`src/lib/auth/neon-proxy.ts`), yet the area backfill ran through it on Production.

## External resources

None changed. Read-only schema and count queries against the local Docker PostgreSQL.

## Next

- Amit answers the eight decisions above (for example "1A 2A 3A 4A 5A 6A 7A 8A").
- Amit confirms the billing state of the Production Google AI project (decision 1).
- Then start Q0 as its own task from current `main`.
