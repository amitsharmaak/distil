---
topic: ui-modernization
title: Lockup gap, sidebar mark and secondary Mark read (#145) released
date: 2026-10-14
status: released
branch: claude/epic-cerf-9ec76a
pr: 145
---

## What changed

Docs only. PR #145 (squash commit `27ce026f`, merged 2026-10-05 08:22 UTC) was merged with
Amit's authorization and Vercel deployed it to Production. The 24-unit lockup gap, the aligned
sidebar mark and the ghost "Mark read" button with the `r` hint are live. The work is described
in `2026-10-05-ui-modernization-logo-gap-and-reader-bar.md`; the merge evidence is in
`2026-10-14-release-train-closeout-october.md`.

## Verification

Derived from `gh` on 2026-10-14: the merge commit and the `success` Production deployment
status. The measurements in the 2026-10-05 entry were local; nothing was re-measured on
`distilai.app`.

## External resources

none

## Next

1. Amit decides whether the green "Mark unread" read state is the accent he wants or whether the
   label should stay muted with only the check coloured. The green state shipped; changing it is
   a small follow-up task.
