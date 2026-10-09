---
topic: ai-router-auth-fallback
title: AI router falls back to Gemini when the optional Anthropic key is rejected
date: 2026-10-09
status: in-progress
branch: claude/upbeat-chaum-273554
---

## What changed

Gemini is the required provider; Anthropic is an optional upgrade for `summarize-complex` and
`research-synthesize` (`src/lib/ai/ai-config.ts`). Before this change the router only used the
Gemini fallback table when `ANTHROPIC_API_KEY` was absent. With a key present but invalid the
provider was registered, Anthropic answered 401, `classifyProviderFailure` mapped it to
`authentication`, and `/api/ai/summarize` showed "The AI service configuration needs attention".
Every long article (over roughly 2k estimated tokens) and every detailed summary routes to
`summarize-complex`, so a bad optional key broke a feature that had a working fallback.

`src/lib/ai/router.ts` now degrades instead:

- When a call on a provider other than Gemini fails with category `authentication`, and the task
  has a Gemini entry in `PROVIDER_FALLBACK_MODELS` and a Gemini provider is registered, the router
  logs `provider_auth_fallback` (provider, model, task, fallback model, trace id, no payload) and
  retries once on the Gemini fallback model for that task. The tenant paths re-run
  `assertTenantAIBudget` before the retry, exactly as the existing quota fallback does; the
  unscoped paths re-run the in-process `checkBudget`.
- The rejection is remembered per provider for the process lifetime (a `Map<ProviderName,
  boolean>` on the router singleton) and logged once as `provider_auth_rejected`. Later calls
  resolve `getEffectiveModel` straight to the Gemini fallback, so the invalid key costs one failed
  round trip per process, not one per call. A restart (or a fixed key plus a redeploy) clears it.
- Gemini authentication failures are unchanged and still surface as `AI_AUTHENTICATION` config
  errors. Applies to `generateText`, `generateJSON`, `generateTenantText` and
  `generateTenantJSONWithMetadata`; the search path already runs on Gemini only.

Tests: `src/lib/ai/__tests__/router-auth-fallback.unit.test.ts` covers the Anthropic 401 on
`summarize-complex` falling back to `gemini-3.5-flash` with the audit row on the serving model;
the process-lifetime skip after one rejection; a Gemini 401 still throwing the authentication
error; the fallback denied when tenant admission fails; and no reroute without a Gemini provider.

## Verification

- Locally verified in this worktree (branch `claude/upbeat-chaum-273554`, base `4aa712e5`):
  `npm test` 271 suites / 2428 tests passed; `npm run lint` 0 errors, 4 pre-existing warnings
  in unrelated files (`intelligence/analyzer.ts`, `intelligence/extractor.ts`,
  `queue/dispatchers.ts`), state-log check ok; `npm run typecheck` clean.
- Before `npm ci` in this worktree, 30 component suites failed to load with
  `Cannot find module '@tanstack/react-query'` and the typecheck reported errors in untouched
  files. Both were a stale `node_modules`, not a code defect; the 26 typecheck errors noted in
  the 2026-10-05 reader entry had the same cause. Run `npm ci` in a new worktree first.
- Not verified against a real rejected key; the provider error shape (`status: 401`) is the one
  `classifyProviderFailure` already handles and is exercised by the existing provider tests.

## External resources

none

## Next

1. Amit: review and merge the PR; the merge is a Production release and needs his authorization.
2. After deploy, a detailed summary on `distilai.app` with the current Anthropic key should
   either use Claude (key valid) or log one `provider_auth_fallback` and succeed on Gemini. If
   the key is invalid, fixing it in Vercel is a separate, authorized env change.
