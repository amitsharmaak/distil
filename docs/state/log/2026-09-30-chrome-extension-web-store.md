---
topic: chrome-extension-web-store
title: Chrome extension token-free sign-in and Web Store listing, plan X1–X3 recorded
date: 2026-09-30
status: planned
branch: claude/chrome-extension-web-store-fb0101
pr: 102
---

## What changed

Design and phased plan only, no code. Amit wants the extension on the Chrome Web Store and wants
users never to handle a capture token: install, sign in, save. The plan is the checkpoint "Chrome
extension: token-free sign-in and Web Store listing — plan X1–X3 — 2026-09-30" in
`docs/project-state.md`: per-browser connection tokens (`kind`/`label` columns on
`capture_tokens`), a public `/extension/connect` page handing a token to the pinned extension id
through `externally_connectable`, "Connected browsers" in Settings, "Sign in again" on rejection.
Phases: **X1** server (migration, routes, connect page), **X2** extension 2.0, **X3** store
listing. X1 ends with a Production migration that needs Amit's authorization; X2 depends on X1
deployed; X3 on X2 and Amit's Web Store developer account. Supersedes the "share a zip of
`browser-extension/`" tester-onboarding step.

## Verification

Docs only. PR #102 merged to `main` (`3a310ac`).

## External resources

None touched.

## Next

- Amit answers the five decisions in the X1–X3 checkpoint and picks a phase (recommended X1).
- Start the phase as its own task from current `main` with the single-session code prompt at the
  end of that checkpoint. Record progress as a new entry with this topic.
