---
topic: admin-invitations
title: First invitee accepted; second invitation issued (extension-only note)
date: 2026-10-19
status: released
branch: claude/distil-account-achal-walia-a4f56a
---

## What changed

Docs only. Follow-up to `2026-10-15-admin-invitations-first-real-invitation.md`.

- The 2026-10-15 invitation shows **Accepted** (invited and accepted Oct 15, 2026) in
  Settings → Invitations, so the invite link → magic link path works end to end for an external
  colleague on Production.
- On 2026-10-19 Amit authorized a second invitation to another colleague at the same
  organization, issued the same way (browser pane signed in as Amit, Settings → Invitations,
  audit note set). The one-time link expires 2026-10-26; the list shows it as **Pending**.
  Addresses are not recorded here.
- Second message variant: the invitee uses Android, so the note carries only the invite link and
  numbered Chrome extension steps (store link → Add to Chrome, pin from the puzzle menu,
  **Sign in to Distil → Connect this browser**, save by icon / right-click / shortcut). No iPhone
  section. Android has no capture client; the web app at `distilai.app` is the phone path.

## Verification

- Observed in the browser pane on 2026-10-19: the one-time link banner with "Expires Oct 26,
  2026", and the new **Pending** row after the list refreshed; the Oct 15 row reads Accepted.
- Whether the first invitee connected a browser or paired a phone is not visible to an admin and
  was not checked.
- Docs gate: `npm run state:check` on this branch.

## External resources

- Production `https://distilai.app`, Settings → Invitations. One more `invitations` row and one
  `operator_audit_events` row written by Amit's admin session.

## Next

- **Amit:** when the second invitee has accepted, add a `closed` entry for this topic. If the
  link expires unused, revoke it from Settings and issue a new one.
- An Android capture path (share-target in the installed web app, or a Chrome-on-Android flow)
  is not planned; open a topic if invitees ask for it.
