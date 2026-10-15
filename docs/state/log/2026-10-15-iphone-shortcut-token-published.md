---
topic: iphone-shortcut-token
title: One-tap pairing verified on device; Shortcut published via iCloud link; Get the Shortcut live
date: 2026-10-15
time: 16:05
status: in-progress
branch: claude/iphone-shortcut-published
---

## What changed

**One-tap pairing verified on Amit's iPhone (Production).** Amit extended his Shortcut with the
code-as-input branch from appendix B of `docs/iphone-shortcut.md`: **Match Text** on Shortcut
Input against `^[0-9A-HJKMNP-TV-Z]{4}-?[0-9A-HJKMNP-TV-Z]{4}$` (case-insensitive), the pairing
gate as **Any of** "Capture Token has no value" / "Matches has a value", an inner If that takes
the first match as **Pairing Code** or otherwise asks for it, the exchange body sending
**Pairing Code**, and the post-pairing stop as **Any of** "no Shortcut Input" / "Matches has a
value". Results reported from the phone:

- Settings → Capture → iPhone → **Pair this iPhone** → **Pair on this iPhone**: Safari opened
  Shortcuts, no code prompt, **iPhone paired.**, connection shown in the card. A first attempt
  ended in a Shortcuts "Conversion Error" from **Get URLs from Input** because the second
  condition of the final stop was bound to a Text action instead of **Matches**; after rebinding
  it the run ends cleanly.
- Chrome share after one-tap pairing: **Saved to Distil**.
- **Disconnect**, then a share: still `Distil could not save this link. Try again.` even after
  rebuilding the branch as a single **Get Dictionary Value** with key path `error.code` bound
  directly to the If. The server answers a revoked token exactly like an unknown one (the token
  resolver returns nothing for `revoked_at IS NOT NULL`, giving 401 `UNAUTHORIZED`), so the
  defect is in the Shortcut's parsing. Not yet tried: **Get Text from Input** on the raw response
  and **If Text contains UNAUTHORIZED**, which avoids dictionary lookups entirely, plus a
  temporary **Show Alert** of the raw response (it never contains a credential) to see what the
  phone actually received. The appendix is not changed again until one of these is confirmed.

**Shortcut published.** Amit shared **Save to Distil** from the Shortcuts app with **Copy iCloud
Link** (`https://www.icloud.com/shortcuts/34c1cf8e39a9402d84d07f6682b46a1d`, credential-free; the
stored token lives only in the user's iCloud Drive file). The session filled the Vercel form via
Claude in Chrome with Amit's authorization in chat (type Config, Production only) and Amit pressed
Save himself after the permission classifier refused the click; Amit then triggered the redeploy
from the Deployments list. The first "Redeploy" attempt did not start a build, visible only as the
absence of a new row; the second did.

**Live.** The Production deployment `project-evgf1-1nrnqkng6-pv-1850.vercel.app` (same source
commit `ea515acd`, created by the redeploy) is **Ready**, and `https://distilai.app/settings`
renders **Get the Shortcut** with that iCloud href next to **Pair this iPhone**. A new user's path
is now: Get the Shortcut → Add Shortcut → Pair this iPhone → Pair on this iPhone → share.

## Verification

Locally verified in this session:

- Vercel Overview shows the new Production deployment as Ready with source `main @ ea515acd`;
  the environment-variables list shows `NEXT_PUBLIC_IOS_SHORTCUT_URL`, Production, added today.
- `https://distilai.app/settings` in Amit's signed-in Chrome: the **Get the Shortcut** link's
  href is the iCloud link above.
- `origin/main` is `21d03f40`; the working tree was clean before this branch was created.

Reported by Amit from the phone, not re-checked by the session: one-tap pairing, the Chrome save,
and the Disconnect failure. The published Shortcut has **not** been installed from the link on a
second device yet. The docs-only merge `21d03f40` produced no Production build because
`scripts/vercel-ignore-build.sh` skips docs-only commits, as `docs/vercel-deployment.md` records.

## External resources

- Vercel project `project-evgf1` (team `pv-1850`): environment variable
  `NEXT_PUBLIC_IOS_SHORTCUT_URL` added for Production; one manual redeploy of `ea515acd`.
- iCloud Shortcut link above, shared from Amit's personal Apple Account.
- Neon: no change.

## Next

1. **Amit, on the phone:** fix the Disconnect branch with the raw-text check (Get Text from
   Input on the response, If Text contains `UNAUTHORIZED`, Delete File, disconnect message, Stop)
   and confirm with Disconnect → share → **Pair on this iPhone** → share. Then copy a fresh iCloud
   link, update `NEXT_PUBLIC_IOS_SHORTCUT_URL` in Vercel and redeploy; installed copies do not
   update, so this should happen before anyone else installs. Record the confirmed recipe wording
   in a docs entry and correct appendix C step 6.
2. Install from **Get the Shortcut** on a second phone with a different Apple Account and Distil
   account; pair and confirm each account sees only its own captures.
3. Remaining checklist items: Safari duplicate share, text with no link, expired code, Airplane
   Mode.
4. After one successful share with the published version on Amit's phone: delete **Save to Distil
   Old** and regenerate or revoke the manual token named `iPhone Shortcut`.
