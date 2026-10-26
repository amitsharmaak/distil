---
topic: chrome-extension-web-store
title: Install link points at the Chrome Web Store listing (#154) released
date: 2026-10-26
status: released
branch: claude/kind-lehmann-ded362
pr: 154
---

## What changed

This entry is docs only; PR #154 was a code release. PR #154 (squash commit `4efee406`, merged 2026-10-26 13:28 IST) was merged with
Amit's authorization as the last of four PRs merged that day, in this order: #157 (`cbc94ed2`),
#158 (`aef747d8`), #159 (`71d626e1`), #154 (`4efee406`). It carried the change described in
`2026-10-14-chrome-extension-web-store-approved.md`: `DISTIL_EXTENSION_INSTALL_URL` in
`src/lib/extension/constants.ts` now uses the store id `malhlcmmheemmdebmjpgliligpjlnama`
(the open item in `2026-10-15-chrome-extension-web-store-listing-live.md`), and
`docs/onboarding.md` §3 and `browser-extension/README.md` describe the store install and the
sign-in handoff.
The main Quick gate passed on `4efee406`, the head after all four merges, and Vercel deployed
it to Production (deployment `2XLjuNcbSYY3uVofohS88nDTsNU9`, status Ready, the `distilai.app`
alias created 2026-10-26 13:28 IST). This deployment also carries #159. The merge evidence
comes from the session that ran the merges.

## Verification

Derived from the merge session's report of the commits, the Quick gate and the deployment status.
Not re-verified on `distilai.app` after the deploy: that "Install the extension" on
`/extension/connect`, in a browser without the extension, opens the store listing. The store
install, sign-in and save were reported by Amit on 2026-10-14; the listing returned HTTP 200 on
2026-10-15.

## External resources

none. Chrome Web Store item `malhlcmmheemmdebmjpgliligpjlnama` (Unlisted, version 2.0.0) is
unchanged.

## Next

1. Check `distilai.app/extension/connect` once in a browser without the extension: the install
   link should open the store listing.
2. Feed freshness after a save (the 2-minute client cache) is its own task when Amit picks it;
   candidate fixes are in `2026-10-14-chrome-extension-web-store-approved.md`.
3. Amit decides the Feed default sort and the Today-vs-Feed definition in a later session.
4. Revisit the trader declaration if Distil becomes a commercial product.
