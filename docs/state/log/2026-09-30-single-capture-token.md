---
topic: single-capture-token
title: One capture token per account
date: 2026-09-30
status: merged
pr: 90
---

## What changed

Settings → Capture manages one token: generate, copy once, regenerate (revokes every earlier token,
legacy ones included). Storage unchanged (hash only, no reveal). Squash merged `36d8285` at Amit's
request after green CI. Checkpoint "Single capture token — 2026-09-30" in `docs/project-state.md`.

## Verification

Locally verified: `npm run check`, `npm run test:integration`. The merge auto-deploys; Production
was not checked.

## External resources

None touched.

## Next

- Production's two legacy tokens keep working until Amit first regenerates; he then pastes the new
  token into the extension and the iPhone Shortcut. Both steps are superseded once X1–X3 and D1–D3
  ship.
