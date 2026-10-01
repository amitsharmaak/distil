---
topic: digest-cron
title: Nightly digest cron closed after CRON_SECRET removal
date: 2026-09-30
time: 20:10
status: closed
branch: claude/pending-items-summary-4e9398
---

## What changed

Amit confirmed in chat on 2026-09-30 that he deleted `CRON_SECRET` from Vercel Production, the
last step after PR #107 (`90c9deb`). The two other handler-less job types are tracked under the
`backlog` topic. No code changed.

## Verification

Amit's confirmation in chat; not re-checked by an agent.

## External resources

Vercel Production environment variable `CRON_SECRET`, removed by Amit.

## Next

Nothing open.
