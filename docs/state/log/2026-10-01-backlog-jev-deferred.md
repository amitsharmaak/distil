---
topic: backlog
title: Classifier model (decision 12) closed: Jev evaluated and deferred; capture priority and junk-page check added
date: 2026-10-01
time: 08:05
status: ongoing
branch: claude/backlog-jev-decision
---

## What changed

This entry supersedes the "Remaining backlog" list in `2026-10-01-backlog-housekeeping.md`. The
classifier model item (inline-search decision 12) is closed: the model was evaluated and not
adopted. A new item, a capture priority score and junk-page check, is added.

**Decision 12 identified: Jev by TypeSafe AI**

- "The new TypeSafe model GeV" is **Jev** by **TypeSafe AI**, in early access since 2026-09-15.
  Model id `jev-1.13.0`, with aliases `jev-latest` and `jev-preview`.
- It is a "System One" decision model, not a text generator. You send it text or JSON state plus
  typed questions, and it answers them in parallel:
  - Choice: one of up to 255 options.
  - Score: a 2–10 level rubric.
  - Noul: a yes/no probability.
- Each answer has a calibrated confidence.
- API: `POST https://api.typesafe.ai/v1/systemone`, key `TYPESAFE_API_KEY`.
- Price: $0.042 per 1M input tokens; output is free. Vendor-claimed latency is 70–500 ms.
- Hosted in US West (Distil runs in `sin1`). Zero data retention is enterprise only.
- Weak at text generation, arithmetic, dates and multi-step reasoning. Large irrelevant context
  lowers its accuracy.
- Sources:
  - https://typesafe.ai/blog/introducing-system-one-models-and-jev
  - https://docs.typesafe.ai/models (spot-checked by the orchestrator)
  - https://docs.typesafe.ai/model-jaggedness/jev-1.13.md

**Fit across Distil's AI tasks** (every task in `src/lib/ai/ai-config.ts`)

- Strong fit for `classify-area`, which is a 4-label Choice.
- Poor fit for summaries, every research stage and preference analysis, because they generate
  text.

**Amit's decision, 2026-10-01: Jev is not integrated; the item is closed.** Reasons:

- The saving is negligible: area classification on `gemini-3.5-flash-lite` costs about $0.02/day.
- There is no latency benefit, since classification runs in the background capture queue.
- Flash-lite shows no accuracy problem (the last full run classified 24 items with 0 failures).
- Integration is not a model swap. Jev's API shape does not fit the `AIProvider`
  `generateText`/`generateJSON` interface in `src/lib/ai/providers.ts`. It would mean a fourth
  provider with its own client, fallback, `audit:ai-models` support, a new Vercel env var, and a
  new US-hosted subprocessor receiving captured content.
- The model is two weeks old, with no independent benchmarks.

Revisit triggers, which is when to look at Jev again:

- Distil gets many users, so per-capture cost or throughput matters.
- High-volume yes/no decisions where calibrated confidence matters (for example research source
  triage).
- Flash-lite proves to misclassify areas often (check the `manual_area` correction rate).

Do not re-propose Jev otherwise.

**New backlog item: capture priority score and junk-page check (flash-lite)**

Found during the fit analysis:

- Hosted captures always default to `priority: "medium"` (`src/lib/capture/schema.ts`), and
  nothing sets `ai_priority_score`. So Today's "six highest-priority unread"
  (`src/lib/feed/today-selection.ts`, `src/lib/feed/feed-query.ts`) is mostly recency plus feedback
  affinity.
- The only quality test is the character threshold `MIN_READABLE_TEXT_CHARACTERS` in
  `src/lib/capture/worker.ts`. Login walls, cookie or consent pages, paywall stubs and error pages
  that pass it are saved, summarised and classified.

Proposal:

- One small structured call at capture time on the existing router (`gemini-3.5-flash-lite`). It
  returns a priority score and an "is this the real article?" flag.
- The score fills `ai_priority_score`. The junk check runs before the summary call.
- No new provider or key.
- Not started; it needs a design and an eval. For example, Amit labels about 50 recent items for
  priority; for the junk check, a known-bad set plus about 50 good ones, targeting zero false
  rejects.
- Re-verify the file references against `main` when starting.

Side note: the same analysis found dead code. These are cleanup candidates, not scheduled:

- The `prioritize` AI path with `useAI` (`src/lib/ai/prioritize.ts`). Only
  `POST /api/ai/prioritize` passes `useAI`, and no UI calls that route.
- The grounded summary runtime (`src/lib/knowledge/intelligence-runtime.ts`). It is re-exported
  from `src/lib/knowledge/index.ts`, but no job handler uses it outside its unit test.

**Remaining backlog (each becomes its own topic when picked up)**

- Capture priority score and junk-page check on flash-lite (new).
- Performance: the Vercel + Neon cold start. Re-opened 2026-10-01 after Amit's Vercel Pro upgrade.
  Pro's automatic "scale to one" pre-warming may remove most of the Vercel cold tail; a public
  cold-start measurement is in progress. Never keep Neon Free awake with database pings
  (182.5 CU-h/month exceeds the 100 CU-h allowance, so the compute would be suspended mid-month).
- Phase 4 (mobile), only on Amit's decision.

## Verification

Docs only. The research was done by a read-only sub-agent; no paid API calls. The dead-code claims
were re-checked with `grep` on this branch. `npm run state:check` and a Prettier check on this file
passed. No deploy; no database or environment change.

## External resources

None touched.

## Next

- Amit picks the next backlog item.
