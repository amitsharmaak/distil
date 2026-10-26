---
topic: iphone-shortcut-token
title: One-tap pairing, published Shortcut and Get the Shortcut (#157) released
date: 2026-10-26
status: released
branch: claude/kind-lehmann-ded362
pr: 157
---

## What changed

This entry is docs only; PR #157 changed docs only. PR #157 (squash commit `cbc94ed2`, merged 2026-10-26 13:25 IST) was merged with
Amit's authorization as the first of four PRs merged that day, in this order: #157 (`cbc94ed2`),
#158 (`aef747d8`), #159 (`71d626e1`), #154 (`4efee406`). #157 added only
`2026-10-15-iphone-shortcut-token-published.md`; #158 added
`2026-10-15-iphone-shortcut-token-icloud-link-published.md` for the same topic. The code and the
Vercel variable they describe (one-tap **Pair on this iPhone**, **Get the Shortcut** from
`NEXT_PUBLIC_IOS_SHORTCUT_URL`) were already live on Production from the 2026-10-15 redeploy, so
neither docs commit built anything: `scripts/vercel-ignore-build.sh` skips docs-only commits.
The main Quick gate passed on `4efee406`, the head after all four merges, and Vercel deployed
that commit to Production (deployment `2XLjuNcbSYY3uVofohS88nDTsNU9`, status Ready, the
`distilai.app` alias created 2026-10-26 13:28 IST). The merge evidence comes from the session
that ran the merges.

## Verification

Derived from the merge session's report of the commits, the Quick gate and the deployment status.
Nothing was re-tested on `distilai.app` after the 2026-10-26 deploy: not the **Get the Shortcut**
link on Settings, not one-tap pairing, and not a share from the phone. The device results in the
2026-10-15 entries were reported by Amit from his phone and are unchanged.

## External resources

none

## Next

The open items from `2026-10-15-iphone-shortcut-token-published.md` and
`2026-10-15-iphone-shortcut-token-icloud-link-published.md` are unchanged:

1. **Amit, on the phone:** fix the Disconnect branch (still shows `Distil could not save this
link. Try again.` after Disconnect) with the raw-text check described in the 2026-10-15 entry,
   confirm Disconnect → share → **Pair on this iPhone** → share, then re-share so the public
   iCloud link carries the fixed version and update `NEXT_PUBLIC_IOS_SHORTCUT_URL` if the link
   changes. Record the confirmed recipe wording and correct appendix C step 6 of
   `docs/iphone-shortcut.md`.
2. Install from **Get the Shortcut** on a second phone with a different Apple Account and Distil
   account; pair and confirm each account sees only its own captures.
3. Remaining checklist items: Safari duplicate share, text with no link, expired code, Airplane
   Mode.
4. After one successful share with the published version: delete **Save to Distil Old** and
   regenerate or revoke the manual token named `iPhone Shortcut`.
