---
topic: iphone-shortcut-token
title: iPhone Shortcut without a visible token, plan D1–D3 recorded
date: 2026-09-30
status: planned
branch: claude/iphone-shortcut-token-abstraction-e945a7
pr: 105
---

## What changed

Design and phased plan only, no code: checkpoint "iPhone Shortcut without a visible token: design
and phased plan (D1–D3) — 2026-09-30" in `docs/project-state.md`. Recommended shape: one public
token-free Shortcut that pairs itself with a short code shown in Settings → Capture and stores a
phone-only `phone` token. It reuses the `kind`/`label` columns and kind-scoped `replaceActive`
that Chrome plan X1 introduces, and supersedes X1's "manual token stays for the Shortcut" once D3
ships. Phases: **D1** data and API, **D2** Settings card, **D3** Shortcut and runbook.

## Verification

Docs only. PR #105 merged to `main` (`b8800b2`).

## External resources

None touched.

## Next

- Amit answers the five lettered decisions in the D1–D3 checkpoint, including D1's order against
  X1 (D1 builds on X1's token kinds).
- Start the chosen phase as its own task; record progress under this topic.
