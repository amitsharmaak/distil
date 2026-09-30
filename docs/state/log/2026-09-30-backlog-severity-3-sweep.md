---
topic: backlog
title: Severity-3 sweep: cache pricing fixed, BUG-PWA-001 fixed, two bugs closed by evidence
date: 2026-09-30
time: 16:58
status: ongoing
branch: claude/elegant-bohr-e32023
pr: 108
---

## What changed

Amit asked for every pending task consolidated into one severity-ranked list, then said "deal
with severity 3 problems now" (the follow-ups and small bugs). This entry supersedes
`2026-09-30-backlog.md` as the backlog list.

**Done in code (PR [#108](https://github.com/amitsharmaak/distil/pull/108))**

- **Anthropic prompt-cache pricing** (follow-up from "AI cost accounting: verified prices,
  thinking tokens, grounding fee — 2026-09-29"). `ProviderUsage` gains optional
  `cacheWriteTokens` / `cacheReadTokens` (both already inside `inputTokens`), filled by
  `AnthropicProviderImpl` from `cache_creation_input_tokens` and `cache_read_input_tokens`.
  `estimateCost` bills the uncached share at the input rate, writes at
  `ANTHROPIC_CACHE_WRITE_MULTIPLIER` (1.25×) and reads at `ANTHROPIC_CACHE_READ_MULTIPLIER`
  (0.1×) in `src/lib/ai/ai-config.ts`. Metrics' `tokens_in` stays the total. For the record: the
  Sonnet system block does carry `cache_control: ephemeral`, but it is far below Anthropic's
  1,024-token cache minimum, so no cache tokens are produced today and recorded costs do not change
  until a cacheable prompt exists.
- **`BUG-PWA-001` fixed.** In standalone (home-screen) mode `globals.css` padded `body` by
  `--safe-top`, but the top bar is `position: sticky; top: 0`, so after the first scroll it pinned
  to the viewport edge under the iPhone status bar and Dynamic Island. The header now carries
  `distil-topbar` and the same `display-mode: standalone` rule sets its `top` to `--safe-top`.
  A component test asserts the hook. Not yet seen on a physical iPhone.

**Closed without code**

- `BUG-PWA-002` (login brand asset): the only brand `<img>` is `next/image` on the legacy
  `/login` page; `/logo.png` (128×128) is in `public/` and allow-listed in `src/proxy.ts`; the
  Production `/sign-in` page renders no image. There is no service worker, so "offline-safe" has
  no meaning in the current app.
- `BUG-IOS-001` (Shortcut URL extraction): `docs/iphone-shortcut.md` steps 2–4 and its checklist
  already describe "Get URLs from Shortcut Input → First Item → If empty, `No web link found`".
  Only Amit's own Shortcut instance can be updated, and D1–D3 (`iphone-shortcut-token`) rebuilds it.
- Embeddings costing follow-up: `src/lib/ai/embeddings.ts` was deleted on 2026-09-30, so it is moot.
- Google AI billing decision for grounded research: grounding works on the free-tier key (R3
  Production run `4d1cbcb5`, 23 grounded sources) and Amit confirmed research works on Production
  (chat, 2026-09-30).

**Remaining backlog (each becomes its own topic when picked up)**

- Nightly digest cron is write-only: `/api/cron/digests` enqueues `digest_run` per user, but
  `src/lib/lifecycle/queue-runtime.ts` registers no handler for it (nor for
  `regenerate_intelligence_summary` and `knowledge_backfill`), so `tenant-runtime.ts` completes
  each job with "No tenant handler registered". The cron route returns `FEATURE_DISABLED` when
  `FEATURE_DIGESTS` is unset, so first check that variable in Vercel Production: if unset this is
  dormant housekeeping; if set, choose between deleting the cron entry, route and orphan job types
  (recommended, matches the 2026-09-16 decision not to build digests) or registering handlers.
- Classifier model (inline-search decision 12): Amit names the exact provider model id, then
  `npm run audit:ai-models`, switch `classify-area` in `src/lib/ai/ai-config.ts`, compare a local
  sample against flash-lite.
- Adaptive summaries S3 (depth on demand): planned, starts from `main` on Amit's decision.
- Device-only bugs, not attempted blind: `BUG-IOS-002` (touch highlighting opens the anchored
  highlight panel) and `BUG-READER-001` (reading position did not restore on a physical iPhone).
- `ai_summaries.content_hash` exists in Production but is not wired into the summary cache key.
- Performance candidates outside any plan: the P7 RLS/ordering index question, the
  `distil_resolve_auth_identity` lookup cost, the Vercel + Neon cold start.
- Housekeeping: stale local branches and the unrelated `jabra-evolve-mic-test` worktree; the legacy
  alias `distil-pv-1850.vercel.app` still on the P1 release; a future `collections` table drop
  (needs Amit's explicit approval and a Production-data check).
- Phase 4 (mobile) starts only on Amit's explicit decision.

## Verification

Locally on this branch before merging `main`: `npm run check` 244 suites / 2,001 tests passed,
lint 0 errors (baseline warnings only), typecheck clean. Re-run after the merge is recorded in
PR #108. Not deployed; no cloud, database or environment change.

## External resources

None.

## Next

- Merge PR #108 when CI is green (auto-deploys; release pin `unpinned`). Then Amit opens the
  home-screen app on an iPhone and confirms the top bar stays below the status bar after scrolling.
- Amit picks the next backlog item; the digest-cron decision is the recommended first.
