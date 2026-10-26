---
topic: iphone-shortcut-token
title: One-tap iPhone pairing via a shortcuts:// deep link; recipe accepts the code as input
date: 2026-10-14
status: in-progress
branch: claude/musing-cerf-eef4a6
pr: 155
---

## What changed

Refinement on top of the pairing flow recorded in the previous entries of this topic (PR #125,
released). Until now the user had to read the code in Settings → Capture → iPhone and type it
into the Shortcut's **Ask for Input** prompt. On an iPhone the card now offers **Pair on this
iPhone** beneath the code. It is a plain link to
`shortcuts://run-shortcut?name=Save%20to%20Distil&input=text&text=<code>`, which iOS hands to the
Shortcuts app as the Shortcut's text input, so nothing is retyped. The typed-code path is
unchanged everywhere, and the code stays visible on iOS too.

- `src/lib/platform.ts`: `isIosDevice()` (iPhone/iPad/iPod by platform, client hints or user
  agent; iPadOS Safari, which reports a touch-screen Mac, counts). Unit-tested in
  `src/lib/__tests__/platform.unit.test.ts`.
- `src/components/capture/iphone-shortcut-card.tsx`: the iOS decision is taken after hydration
  (state set in an effect) so server markup matches every device. The link has no `target`; the
  code is embedded only in the `href` the OS opens. A code comment records why that is
  acceptable: single use, ten-minute life, never fetched, logged or sent to analytics by Distil.
  Copy under the code changes on iOS to point at the button.
- `src/components/capture/__tests__/iphone-shortcut-card.component.test.tsx`: two new tests
  (link href and copy on iOS, href follows a replacement code, link gone at expiry and after a
  successful pairing; no deep link in any fetch) plus a non-iOS assertion that the link is
  absent.
- `docs/iphone-shortcut.md`: "Pair once" describes the button and the Safari "open Shortcuts"
  prompt; appendix section B gains step 1 (match Shortcut Input against
  `^[0-9A-HJKMNP-TV-Z]{4}-?[0-9A-HJKMNP-TV-Z]{4}$`, case-insensitive, before any URL
  extraction) and step 7 stops after **iPhone paired** when the input was the code; the device
  checklist gains a one-tap item.
- `docs/user-guide.md` "Save from iPhone" matches.

**Deliberate widening of the brief, recorded for review.** The brief asked the recipe to use
code-shaped input only when no credential file exists. The recipe instead takes the pairing
branch for code-shaped input whether or not a file exists, replacing the stored credential on
success. Reason: **Disconnect** leaves a stale `Distil/token.txt` until the next share clears
it, and the recipe extracts URLs before calling the capture API. With the narrow rule a user who
disconnects and then taps **Pair on this iPhone** would get **No web link found** every time,
and the stale file would never be cleared. A code is never a link worth saving, and a wrong or
stale code still fails safely at the exchange. If the narrow rule is preferred, change appendix
B step 1 only; the web card is unaffected.

## Verification

Locally verified in this worktree after `npm ci` (the worktree's `node_modules` predated the
2026-10-02 lockfile change):

- `npx jest src/lib/__tests__/platform.unit.test.ts`: 5 passed.
- `npx jest src/components/capture/__tests__/iphone-shortcut-card.component.test.tsx`: 13 passed
  (11 existing, 2 new).
- `npm run check` (lint, formatting, state check, typecheck, all deterministic suites): 275
  suites, 2,472 tests passed; lint reports the four pre-existing warnings and zero errors.

Not verified: no physical iPhone was used. The `shortcuts://run-shortcut` text-input hand-off,
Safari's open-in-Shortcuts prompt and the **Match Text** action in the recipe are documented
Apple behaviour but untested here; the device checklist item covers them. Not deployed; no
Vercel or Neon change.

## External resources

None. The link target is Apple's `shortcuts://` URL scheme on the user's own phone; no Distil
server receives it.

## Next

1. Amit reviews the single PR for this branch, including the widening recorded above, and
   authorizes the squash merge. Merging auto-deploys while the release pin is `unpinned`; no
   migration and no environment-variable change are needed.
2. **Amit's device step**, after the basic flow from the previous entry's D3 list passes and the
   Shortcut has been rebuilt with appendix B steps 1 and 7: on the iPhone, open
   `https://distilai.app` in Safari, Settings → Capture → iPhone, tap **Pair this iPhone**, then
   **Pair on this iPhone**. Expect Safari's open-in-Shortcuts prompt, no code prompt, **iPhone
   paired**, no capture request, and the connection in the card on return. Then **Disconnect**,
   generate a new code and repeat without sharing a link first; it must pair in one tap. Finally
   tap the button after a code has expired; it must report pairing failure. Record the result in
   a new entry for this topic.
3. If the recipe's **Match Text** or **Trim Whitespace** labels differ on the target iOS, correct
   the appendix wording in a follow-up docs entry; the regex and the server's accepted pattern are
   identical and need no change.
