---
topic: iphone-shortcut-token
title: Pairing verified on a real iPhone; one-tap button released (PR 155); two recipe corrections
date: 2026-10-14
time: 11:05
status: in-progress
branch: claude/amazing-jemison-94490b
---

## What changed

**Real-device acceptance, first pass (Amit's iPhone, Production).** Amit built the pairing
Shortcut from the appendix in `docs/iphone-shortcut.md`, guided action by action in a Claude
session, as a duplicate of his old manual-token Shortcut (renamed **Save to Distil Old**, Share
Sheet off, kept until the new one passes). Results, as reported by Amit from the phone and the
Settings card:

- Direct run with no input asked for the code, exchanged it against
  `https://distilai.app/api/v1/shortcut-pairings/exchange`, reported **iPhone paired.** and made
  no capture request. Settings → Capture → iPhone listed the connection.
- A Chrome share reported **Saved to Distil**; the card then showed **Last used today**, so the
  capture used the phone credential. These are the first real exchange and first phone-token
  capture against Production; the 2026-10-02 closeout had recorded both as unverified.
- **Disconnect** in Settings, then a share: Production answered 401 `UNAUTHORIZED` (confirmed
  separately with an invalid bearer token from this session), but the Shortcut showed
  `Distil could not save this link. Try again.` instead of the disconnect message. Cause and fix
  below. The stale `Shortcuts/Distil/token.txt` therefore stayed on the phone; Amit is deleting
  it by hand in Files.
- Not yet run: Safari duplicate share, text with no link, wrong or expired code, second phone,
  Airplane Mode, and the new one-tap item.

**Two recipe corrections in `docs/iphone-shortcut.md`, both found on device.**

1. Appendix A step 2 told the builder to initialize **Capture Token** to empty text. Shortcuts
   treats empty text as a value, so **If Capture Token does not have any value** was false and a
   fresh phone skipped pairing with **No web link found**. The step now says to leave the
   variable unset; appendix B step 1 says the same for **Pairing Code**.
2. Appendix C step 6 chained two **Get Dictionary Value** lookups (`error`, then `code`). Every
   lookup output is named **Dictionary Value**, and the second lookup had bound to the earlier
   `receipt` lookup, which is empty on a 401. The step now uses one lookup with the key path
   `error.code`.

**One-tap pairing released.** PR #155 (`claude/musing-cerf-eef4a6`, squash commit `ea515acd`)
was merged by Amit from his terminal after he authorized the release in chat; the session's own
merge command was refused by the Claude Code permission classifier. The card on iOS now shows
**Pair on this iPhone** under the code. Amit's installed Shortcut does not yet have the
code-as-input branch (appendix B step 1 and step 7), so the button on his phone currently ends in
**No web link found**; the typed-code path and Share Sheet saves are unaffected.

## Verification

Locally verified in this session:

- `POST /api/v1/captures` on `https://distilai.app` with an invalid bearer token returns 401
  with `{"error":{"code":"UNAUTHORIZED"}}`, so the Shortcut's disconnect test key is correct.
- GitHub deployment `7063305538` (environment Production, sha `ea515acd`) has status `success`;
  the Vercel commit status on `ea515acd` is `success`; `/api/health` on `distilai.app` returns 200. The deployed bundle was not inspected; the settings page redirects unauthenticated
  requests to sign-in.
- Docs gate: `npm run lint` (includes `state:check` and Prettier) on this branch; see the PR's
  CI for the exact-head result.

Device facts above are Amit's reports from the phone, not re-checked by the session. PR #155's
own tests (2,472 passing) are recorded in `2026-10-14-iphone-shortcut-token-one-tap-pairing.md`.

## External resources

- Production `https://distilai.app`; Vercel deployment `7063305538` via the Git integration.
  No environment variable changed; `NEXT_PUBLIC_IOS_SHORTCUT_URL` is still unset.
- Neon: no change. One phone capture token was created and one revoked by Amit's own actions in
  Settings.

## Next

1. **Amit, on the phone:** delete `Shortcuts/Distil/token.txt` in Files (or apply correction 2
   to the Shortcut so the next 401 deletes it), then re-pair with a fresh code. Apply correction 2
   either way before the Disconnect checklist item is re-run.
2. **Amit, on the phone:** add the code-as-input branch (appendix B steps 1 and 7: **Match Text**
   on Shortcut Input against the code pattern, use the match as the code, stop after
   **iPhone paired**) and run the one-tap checklist item: Settings → **Pair this iPhone** →
   **Pair on this iPhone**.
3. Finish the rest of the real-device checklist in `docs/iphone-shortcut.md`, then record pass/fail
   per item in a new entry for this topic.
4. When the checklist passes: Shortcuts → share **Save to Distil** → **Copy iCloud Link**; set
   `NEXT_PUBLIC_IOS_SHORTCUT_URL` for Production in Vercel; redeploy; confirm **Get the Shortcut**
   appears in the card. Record the deployment in a new entry.
5. After one successful share with the published Shortcut: delete **Save to Distil Old** and
   regenerate or revoke the manual token named `iPhone Shortcut` in Settings → Capture.
