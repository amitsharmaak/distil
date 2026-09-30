---
topic: production-operations
title: Production operations standing facts and open checks
date: 2026-09-30
status: ongoing
---

## What changed

Standing facts carried over from the frozen handoff (see `2026-09-30-handoff-snapshot.md`):

- Production is `https://distilai.app` on Vercel (`sin1`) with Neon PostgreSQL. Release pin
  `DISTIL_PHASE3_PRODUCTION_SHA` = `unpinned` since 2026-09-16, so every push to `main`
  auto-deploys.
- The legacy alias `distil-pv-1850.vercel.app` is not a project domain and does not follow
  automatic deployments; it still points at the P1 release `f2e4155` unless re-aliased.
- Model selection: Gemini default, Claude Sonnet for `summarize-complex` and
  `research-synthesize`; Anthropic key added to Production on 2026-09-29. OpenAI is assigned to
  nothing.
- Amit's local, gitignored Claude Code permission rules allow merging green PRs, updating the pin,
  deploying and re-aliasing; releases still happen only when Amit asks (`AGENTS.md` §9).

## Verification

None re-checked while writing this entry.

## External resources

Vercel project `distil`, Neon project `distil-production` and Neon Auth `distil-preview-db`, by
name only.

## Next

Open checks carried over, none blocking:

- Gemini credential: the 2026-09-17 first live capture recorded `AI_AUTHENTICATION` from the
  Production Gemini key. Later summaries and research runs succeeded on Production, so confirm
  this is resolved and record it, or replace `GEMINI_API_KEY` in Vercel (Amit).
- Run `npm run audit:ai-models` with the Production keys or confirm the Claude ids are enabled on
  the Production Anthropic project; optionally remove `OPENAI_API_KEY` from Vercel (Amit).
- Optional password-login check deferred on 2026-09-16: sign in at `/sign-in`, land on Today,
  change the password once from `/account`, confirm the magic-link fallback.
- Wispr Flow: re-share the original `notes.wisprflow.ai` link on Production so a fresh capture is
  created (the old receipt is `rejected` and cannot be retried).
