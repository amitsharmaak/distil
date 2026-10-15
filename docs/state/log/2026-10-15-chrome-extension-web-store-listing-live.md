---
topic: chrome-extension-web-store
title: Store listing is live; install URL constant still points at the development id
date: 2026-10-15
status: in-progress
branch: claude/distil-account-achal-walia-a4f56a
---

## What changed

Docs only. Google's review has completed: on 2026-10-15 a plain `curl` of
`https://chromewebstore.google.com/detail/malhlcmmheemmdebmjpgliligpjlnama` returned HTTP 200,
redirecting to `…/detail/distil-%e2%80%94-save-to-distil/malhlcmmheemmdebmjpgliligpjlnama` with
the title "Distil — Save to Distil - Chrome Web Store". The listing is Unlisted, so the direct
link is what invitees receive; it was first sent in the invitation recorded in
`2026-10-15-admin-invitations-first-real-invitation.md`.

`DISTIL_EXTENSION_INSTALL_URL` in `src/lib/extension/constants.ts` still builds the URL from the
development id `fkodjlobficbnhjidcgeihniinpoiaop`, so any in-app "Install the extension" link
goes to a page that does not exist.

## Verification

- HTTP 200 and page title observed from this session's shell on 2026-10-15. The install itself
  and a save from the store build were not exercised by the session; Amit's own Chrome shows
  two connected browsers in Settings → Capture, which does not say which build they run.
- Docs gate: `npm run state:check` on this branch.

## External resources

- Chrome Web Store item `malhlcmmheemmdebmjpgliligpjlnama` (Unlisted, published).

## Next

1. Point `DISTIL_EXTENSION_INSTALL_URL` at `DISTIL_STORE_EXTENSION_ID` (its own small PR;
   merging is a release and needs Amit's authorization), and update the README, Settings card
   and `docs/onboarding.md` to the store install + **Sign in to Distil** flow.
2. **Amit:** if not already done, install from the store link in Chrome, connect, and save one
   page from the store build; then add a `released` entry and close this topic.
3. Revisit the trader declaration if Distil becomes a commercial product.
