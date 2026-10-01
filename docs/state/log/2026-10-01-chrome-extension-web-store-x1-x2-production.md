---
topic: chrome-extension-web-store
title: Chrome extension X1 and X2 released to Production and verified end to end
date: 2026-10-01
time: 08:01
status: in-progress
branch: claude/x1-x2-production
---

## What changed

Amit authorized releasing X1 and X2 on 2026-10-01. Order followed (stage before code, because the
code names the new columns):

1. PR #118 was brought up to date with `main`. Its migration was renumbered to
   `0015_browser_connections.sql` after `0014_drop_collections.sql` (PR #114), the stage now
   requires `drop-collections`, and its ledger check lists both stages. The authorization method
   count became 121 (both PRs added three) and the inventory counts 47 tables, 91 routes and 18
   pages. Three integration stage lists gained `drop-collections`.
2. Locally: `npm run check` (2082 tests), `test:phase3-isolation`, `audit:phase3-security`, all 13
   PostgreSQL integration suites (fresh database through every stage) and the 13 extension tests
   passed. CI green.
3. Production, run by Amit with the owner connection from a temporary gitignored env file:
   read-only pre-check showed the ledger ending at `drop-collections`, all owners as expected,
   no `kind`/`label` columns and 4 `capture_tokens` rows. Then
   `db:tenant:migrate -- --stage browser-connections` → `Applied browser-connections:
0015_browser_connections.sql` (benign "does not exist, skipping" notices). Post-check: ledger
   ends at `browser-connections`, columns `kind` and `label` present, still 4 rows.
4. Amit merged PR #118 (`80e974b`); Vercel reported the Production deployment complete.

This entry's `time` is 08:01 so that it sorts after the X1/X2 entry, which recorded 08:00 although
it was written earlier in the UTC day; this entry was written at about 06:40 UTC.

## Verification

- Production, checked in Chrome: Today, Feed and Settings load with no console errors; Settings →
  Capture shows Connected browsers; `/extension/connect` opened directly shows "Start from the
  extension"; `/api/v1/extension/connections` returned an empty list before sign-in.
- Amit loaded extension 2.0.0 unpacked (old extension disabled, not removed), signed in through
  the connect page and saved a TechCrunch article: one "Chrome on macOS" connection appeared and
  the item reached the Feed tagged Extension and summarized.
- Disconnect test: after Amit disconnected in Settings and signed in again, the first connection
  was gone and a new one was listed and used.

## External resources

Neon `distil-production`: ledger row `browser-connections`; `capture_tokens.kind` and `.label`
with their checks; `tenant_api.capture_tokens` view rebuilt. Vercel: Production deployment of
`80e974b`. No environment variable changed.

## Next

- Amit moves the extension private key into safe storage; losing it changes the pinned id.
- Amit removes the old extension once 2.0 has been used for a while; the manual capture token stays
  valid for the iPhone Shortcut.
- X3: unlisted Chrome Web Store listing, starting from `main`.
