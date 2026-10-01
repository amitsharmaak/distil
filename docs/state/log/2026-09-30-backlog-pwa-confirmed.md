---
topic: backlog
title: BUG-PWA-001 confirmed fixed on iPhone; next backlog item open
date: 2026-09-30
time: 18:10
status: ongoing
branch: claude/pending-items-summary-4e9398
---

## What changed

PR #108 (Anthropic cache-token pricing, BUG-PWA-001 top-bar safe area) is squash merged as
`7c42aa4` and auto-deployed. Amit marked the iPhone home-screen check done in chat on
2026-09-30. No code changed.

## Verification

Amit's report in chat; not re-checked by an agent.

## External resources

None.

## Next

- Amit picks the next backlog item. Job types still enqueued without a handler:
  `regenerate_intelligence_summary` (behind `POST /api/v1/items/:id/summaries/regenerate`, whose
  pending artifact never completes) and `knowledge_backfill` (operator script only). `digest_run`
  is gone since PR #107.
