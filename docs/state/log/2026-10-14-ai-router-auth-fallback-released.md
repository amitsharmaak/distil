---
topic: ai-router-auth-fallback
title: AI router Gemini fallback on a rejected Anthropic key (#148) released
date: 2026-10-14
status: released
branch: claude/epic-cerf-9ec76a
pr: 148
---

## What changed

Docs only. PR #148 (squash commit `c587da15`, merged 2026-10-13 07:15 UTC) was merged with
Amit's authorization and Vercel deployed it to Production, which also applied the
workspace-scoped `ANTHROPIC_API_KEY` Amit saved on 2026-10-13. The router behaviour is described
in `2026-10-09-ai-router-auth-fallback-anthropic-key.md`; the merge evidence is in
`2026-10-14-release-train-closeout-october.md`.

## Verification

Derived from `gh` on 2026-10-14: the merge commit and the `success` Production deployment
status. No Production summary was run and no Vercel log was read for this entry.

## External resources

none

## Next

1. Amit: request a detailed summary on `distilai.app`; it should be served by Claude. If the
   Vercel logs show `provider_auth_fallback` or `provider_auth_rejected`, the saved key differs
   from the one that passed the local audit; re-check with `npm run audit:ai-models` and update
   Vercel again.
