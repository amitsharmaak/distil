---
topic: chrome-extension-web-store
title: Extension submitted to the Chrome Web Store; pending Google review
date: 2026-10-02
time: 13:25
status: blocked
branch: claude/extension-store-submitted
---

## What changed

Docs only. This entry follows `2026-10-02-chrome-extension-web-store-store-id.md` and records that
the submission happened. "Blocked" here means waiting on Google's review, not on a defect.

- On 2026-10-02 Amit submitted the Chrome Web Store item `malhlcmmheemmdebmjpgliligpjlnama` for
  review. Package `distil-extension-2.0.0.zip`, built from `main` at `73e670e`; visibility Unlisted.
  The developer dashboard shows "Pending review".
- The first submit attempt was refused with "Unable to publish": the publisher account needed a
  contact email, and that email verified (dashboard → Account). Amit added and verified a contact
  email and had selected the non-trader declaration, after which the submission went through. The
  contact email is shown publicly on the store page; the address is deliberately not recorded here.
- The store id is already live in the app: #135 (`dfaa465`) added it to `DISTIL_EXTENSION_IDS`, so
  the connect page can reach the store build once it is installable.

## Verification

- Reported by Amit in the orchestrating session on 2026-10-02. Claude could not read the store
  dashboard (Chrome blocks extensions from scripting Web Store pages), so the dashboard state above
  was not independently verified.
- Locally: the docs checks pass for this entry (state-handoff check and formatting).
- No code, package or deployment changed in this branch.

## External resources

- Chrome Web Store item id `malhlcmmheemmdebmjpgliligpjlnama` (Unlisted, submitted, pending review).

## Next

Waiting on Google's decision; nobody acts until it arrives. Review may take longer than usual
because the package declares broad optional host permissions.

1. If approved: Amit installs from the store link, then "Sign in to Distil" → connect → save one
   page from the store build.
2. Then point `DISTIL_EXTENSION_INSTALL_URL` (`src/lib/extension/constants.ts`) at the store id; it
   still points at the development id. Share the Unlisted link with invitees. The README, Settings
   card and `docs/onboarding.md` follow-ups from the earlier entries still apply.
3. If Google asks for changes or test credentials: inviting a reviewer is a real invitation and
   Amit's decision (see `browser-extension/STORE.md`).
4. Revisit the trader declaration if Distil becomes a commercial product.
