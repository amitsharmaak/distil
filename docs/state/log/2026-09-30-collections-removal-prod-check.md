---
topic: collections-removal
title: Production Feed confirmed without Collections; table drop started
date: 2026-09-30
time: 18:10
status: ongoing
branch: claude/pending-items-summary-4e9398
---

## What changed

Amit confirmed in chat on 2026-09-30 that the Production Feed loads without the Collections
controls, and asked in chat to start dropping the `collections` and `collection_items` tables.
No code changed in this entry.

## Verification

Amit's confirmation in chat; not re-checked by an agent. The deployed commit was not checked.

## External resources

None.

## Next

- The table drop is in progress on `claude/collections-table-drop` (new tenant migration stage;
  local Docker only). Its entry under this topic supersedes this one. The Production row count
  and applying the stage need Amit's explicit go-ahead at that step.
