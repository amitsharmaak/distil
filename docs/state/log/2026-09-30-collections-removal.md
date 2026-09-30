---
topic: collections-removal
title: Collections feature removed from code
date: 2026-09-30
status: merged
branch: codex/remove-collections
pr: 98
---

## What changed

Pages, API routes, UI controls, feed filter and query plumbing, repository port and
implementation, personalization events and read-item resurfacing exceptions are removed
(`0a1e350`). The `collections` and `collection_items` tables, their data, schema, migrations and
lifecycle export/deletion support are intentionally unchanged. Checkpoint "Collections feature
removed (code only) — 2026-09-30" in `docs/project-state.md`.

## Verification

Local deterministic gate and production build passed on the branch. The squash merge
auto-deployed; Production was not checked after the merge.

## External resources

None touched. No database change.

## Next

- Optional: confirm Production serves `0a1e350` or later and that the Feed loads without the
  Collections controls.
- A future table drop needs Amit's explicit approval and a Production-data check first; record it
  as a new entry under this topic.
