---
topic: iphone-shortcut-token
title: Save to Distil Shortcut published as a public iCloud link; env var still unset
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

Not verified by the session: the link was provided by Amit in chat and not opened (the browser
pane cannot load icloud.com Shortcut pages headlessly, and installing is a phone action). Docs
gate: `npm run state:check` on this branch.

## External resources

- Public iCloud Shortcut link above (non-secret; it is the intended distribution URL).
- Vercel Production `NEXT_PUBLIC_IOS_SHORTCUT_URL` is still unset, so **Get the Shortcut** stays
  hidden in the Settings card.

## Next

1. **Amit:** set `NEXT_PUBLIC_IOS_SHORTCUT_URL` to the iCloud link above for Production in
   Vercel, redeploy, and confirm **Get the Shortcut** appears in Settings → Capture → iPhone.
   Record the deployment in a new entry for this topic.
2. **Amit, on the phone:** apply the code-as-input branch (appendix B steps 1 and 7) and the 401
   correction (appendix C step 6) to the installed Shortcut, re-share so the public link carries
   the fixed version, then run the one-tap and Disconnect checklist items.
3. Finish the rest of the real-device checklist in `docs/iphone-shortcut.md` and record pass/fail
   per item in a new entry.
4. After one successful share with the published Shortcut: delete **Save to Distil Old** and
   regenerate or revoke the manual token named `iPhone Shortcut` in Settings → Capture.
5. Refresh `docs/onboarding.md`, which still describes the pre-pairing token flow and the
   load-unpacked extension install.
