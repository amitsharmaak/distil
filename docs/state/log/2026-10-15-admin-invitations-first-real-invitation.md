---
topic: admin-invitations
title: First real invitation issued from Settings; invitation message template
date: 2026-10-15
status: released
branch: claude/distil-account-achal-walia-a4f56a
---

## What changed

Docs only. On 2026-10-15 Amit authorized, and a Claude session issued through the built-in
browser signed in as Amit, the first invitation to an external colleague from Production
Settings → Invitations. The form returned the one-time `/invite#token=…` link (expires
2026-10-22); the list shows the invitation as Pending with an audit note. The invitee's address is
deliberately not recorded here; the Invitations tab masks it.

The invitation message Amit sends by hand now has a settled shape, kept short on his request:

1. Invite link, which address it is bound to, and the expiry; request the magic link; return via
   `/sign-in`.
2. Chrome: install from the Chrome Web Store listing
   `https://chromewebstore.google.com/detail/malhlcmmheemmdebmjpgliligpjlnama`, then
   **Sign in to Distil → Connect this browser**; save by icon, right-click, or Cmd+Shift+S.
3. iPhone: add the Shortcut from the public iCloud link (see
   `2026-10-15-iphone-shortcut-token-icloud-link-published.md`), then
   Settings → Capture → iPhone → **Pair this iPhone**; share via **Save to Distil**.

No capture token appears in the message; both clients pair without one.

## Verification

- Observed in the browser pane after submit: the one-time link banner, "Expires Oct 22, 2026",
  and the new Pending row in the list. The invitee's acceptance has not happened yet.
- The Chrome Web Store listing page returns HTTP 200 with the title "Distil — Save to Distil"
  from a plain `curl`, so the store build is installable; see
  `2026-10-15-chrome-extension-web-store-listing-live.md`.
- Docs gate: `npm run state:check` on this branch.

## External resources

- Production `https://distilai.app`, Settings → Invitations (control-plane client). One
  `invitations` row and one `operator_audit_events` row written by Amit's admin session.

## Next

- **Amit:** confirm the invitee signed in, connected Chrome and paired the iPhone, then add a
  `closed` entry for this topic. If the link expires unused, revoke it from Settings and issue a
  new one.
