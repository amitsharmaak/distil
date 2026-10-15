---
topic: iphone-shortcut-token
title: Save to Distil Shortcut published as a public iCloud link; Get the Shortcut live
date: 2026-10-15
status: in-progress
branch: claude/distil-account-achal-walia-a4f56a
---

## What changed

Docs only. Amit shared **Save to Distil** from the Shortcuts app on his iPhone and published it
as a public iCloud link, which is the install link `docs/iphone-shortcut.md` §1 and the
Settings → Capture → iPhone card refer to:

`https://www.icloud.com/shortcuts/34c1cf8e39a9402d84d07f6682b46a1d`

The link was first handed to an invited colleague in the invitation message recorded in
`2026-10-15-admin-invitations-first-real-invitation.md`. The shared Shortcut contains no account
credential; pairing happens per phone with a code from Settings.

Amit's installed copy had not yet had the code-as-input branch (appendix B steps 1 and 7) applied
when the link was captured, so **Pair on this iPhone** (one-tap) may end in **No web link found**
for installers of this version; the typed-code path and Share Sheet saves work. If the Shortcut is
edited later, Apple keeps the same iCloud link only when it is re-shared from the same Shortcut
and the link is updated; confirm the link still resolves after any edit.

## Verification

- Observed on `https://distilai.app/settings` (Capture → iPhone) from the browser pane signed in
  as Amit on 2026-10-15: **Get the Shortcut** renders as a link to the iCloud URL above, so the
  variable is applied in the deployed Production build.
- The link itself was not opened and no install was exercised; installing is a phone action.
- Docs gate: `npm run state:check` on this branch.

## External resources

- Public iCloud Shortcut link above (non-secret; it is the intended distribution URL).
- Vercel Production `NEXT_PUBLIC_IOS_SHORTCUT_URL` is set to the link above; Amit set it and
  redeployed on 2026-10-15.

## Next

1. **Amit, on the phone:** apply the code-as-input branch (appendix B steps 1 and 7) and the 401
   correction (appendix C step 6) to the installed Shortcut, re-share so the public link carries
   the fixed version, then run the one-tap and Disconnect checklist items.
2. Finish the rest of the real-device checklist in `docs/iphone-shortcut.md` and record pass/fail
   per item in a new entry.
3. After one successful share with the published Shortcut: delete **Save to Distil Old** and
   regenerate or revoke the manual token named `iPhone Shortcut` in Settings → Capture.
4. Refresh `docs/onboarding.md`, which still describes the pre-pairing token flow and the
   load-unpacked extension install.
