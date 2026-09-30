---
topic: production-operations
title: Gemini credential check closed; remaining open checks
date: 2026-09-30
time: 16:58
status: ongoing
---

## What changed

Amit confirmed in chat on 2026-09-30 that deep research works on Production and that the
keyboard-navigation smoke check is done. Brief and detailed summaries, area classification (F6
backfill, 23 items) and research (run `4d1cbcb5`) have all run on Production, so the
2026-09-17 `AI_AUTHENTICATION` check on the Production Gemini key is closed as resolved. The
standing facts in `2026-09-30-production-operations.md` are unchanged.

## Verification

None re-checked here beyond Amit's statement and the recorded Production runs.

## External resources

None.

## Next

Open checks carried over, none blocking:

- Run `npm run audit:ai-models` with the Production keys or confirm the Claude ids are enabled on
  the Production Anthropic project; optionally remove `OPENAI_API_KEY` from Vercel (Amit; cloud
  mutation, not authorized for the severity-3 sweep).
- The local `.env.local` Anthropic key may still be the rejected one (Amit).
- Optional password-login check deferred on 2026-09-16: sign in at `/sign-in`, land on Today,
  change the password once from `/account`, confirm the magic-link fallback.
- Wispr Flow: re-share the original `notes.wisprflow.ai` link on Production so a fresh capture is
  created (the old receipt is `rejected` and cannot be retried).
