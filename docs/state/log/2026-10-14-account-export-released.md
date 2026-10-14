---
topic: account-export
title: Account export — reauthentication fix (#143) released; Production export check still pending
date: 2026-10-14
status: released
branch: claude/epic-cerf-9ec76a
pr: 143
---

## What changed

Docs only. PR #143 (squash commit `5bd4ee5a`, merged 2026-10-03 04:56 UTC) was merged with
Amit's authorization and Vercel deployed it to Production. The reauthentication link now
completes through `/api/auth/sign-in/complete`, so a fresh session is minted before "Retry
action". The diagnosis is in `2026-10-03-account-export-reauthentication-link-never-refreshed-session.md`;
the merge and deployment evidence is in `2026-10-14-release-train-closeout-october.md`.

## Verification

Derived from `gh` on 2026-10-14: the merge commit and the `success` Production deployment
status. Nothing on `distilai.app` was re-checked; the "Request export → link → retry → export
ready" sequence has still not been run on Production.

## External resources

none

## Next

1. Amit, on `distilai.app`: Account → "Request export" → "Email verification link" → open the
   link in the same browser → confirm "You're verified for the next 10 minutes" → "Request
   export" again → one new export row. If the page says "The link didn't start a new session",
   record it in a new entry (`reauthentication_session_not_renewed` in the Vercel logs).
2. Still not recorded as done from `2026-10-02-account-export-fixes.md`: the Vercel Production
   object-store variables, the `ready` → Download → ZIP check, and the purge-trigger decision.
