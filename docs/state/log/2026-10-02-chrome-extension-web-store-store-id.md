---
topic: chrome-extension-web-store
title: Store draft uploaded; store item id registered with the connect page (not yet submitted)
date: 2026-10-02
time: 12:41
status: in-progress
branch: claude/extension-store-id
---

## What changed

- The extension package was uploaded to the Chrome Web Store developer dashboard on 2026-10-02 as a
  **draft** item. It has **not** been submitted for review.
  - Package: `distil-extension-2.0.0.zip`, built with `npm run extension:pack` from `main` at
    `73e670e`, so it includes the new logo from #133.
  - Item id assigned by the store: `malhlcmmheemmdebmjpgliligpjlnama`.
  - Store listing, Privacy practices and Distribution fields were filled from
    `browser-extension/STORE.md`; visibility is Unlisted.
  - Four 1280×800 screenshots were generated from a local run with fictional data.
- This branch registers the store id with the web app, as `STORE.md` ("Package") requires before
  testers install: `src/lib/extension/constants.ts` adds `DISTIL_STORE_EXTENSION_ID` and lists it in
  `DISTIL_EXTENSION_IDS` after the development id. `sendConnectMessage`
  (`src/lib/extension/handoff.ts`) already tries the ids in order and moves on only when an id is
  unreachable, so no other code changed. The extension version and the packed zip are untouched.
- Tests: the unit test pins the list (development id, then store id, both 32 letters a–p) and adds
  a case where the development id is unreachable and the store build accepts. The silence case now
  waits one timeout per id.
- `STORE.md` records the item id instead of "add it after the first upload".

## Verification

- Locally: `npm run check` passes on this branch (counts in the PR body).
- Not verified here: the dashboard state above (draft, fields, screenshots) is recorded as reported
  for this task and was not re-read. The store build has not been installed from the store, so the
  connect handoff to the store id is covered by unit tests only.
- Not deployed: Production still lists only the development id until this PR is merged.

## External resources

- Chrome Web Store item id `malhlcmmheemmdebmjpgliligpjlnama` (draft, Unlisted, not submitted).

## Next

1. Amit merges this PR; the merge deploys to Production. Until then the connect page cannot reach
   the store build.
2. Amit submits the draft item for review in the developer dashboard.
3. After approval, verify with the store build: install → "Sign in to Distil" → connect → save.
4. Still open from the X3 entry: after approval, link the store page from the README and the
   Settings card. `DISTIL_EXTENSION_INSTALL_URL` still points at the development id and
   `docs/onboarding.md` still says the extension is installed from a folder; both change once the
   listing is live.
5. If review asks for test credentials, that means an invitation and is Amit's decision.
