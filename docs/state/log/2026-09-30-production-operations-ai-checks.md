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
2026-09-17 `AI_AUTHENTICATION` check on the Production Gemini key is closed as resolved.

Later on 2026-09-30 Amit also confirmed in chat: `npm run audit:ai-models` has been run with the
Production keys and passes; the local Anthropic key has been replaced; the original Wispr Flow
note has been shared again on Production. Those three checks are closed. Amit also decided to keep `OPENAI_API_KEY` in Vercel for
possible future use, even though nothing on the default path reads it; do not re-propose removing
it. The standing facts in
`2026-09-30-production-operations.md` are unchanged.

## Verification

None re-checked here beyond Amit's statement and the recorded Production runs.

## External resources

None.

## Next

Open checks carried over, none blocking:

- Optional password-login check deferred on 2026-09-16: sign in at `/sign-in`, land on Today,
  change the password once from `/account`, confirm the magic-link fallback.
- Optional: confirm the re-shared Wispr Flow note produced an item on Production.
