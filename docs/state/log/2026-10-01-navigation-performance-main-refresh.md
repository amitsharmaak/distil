---
topic: navigation-performance
title: Main refreshed through extension 2.0; cache plan reconciled with new auth flows
date: 2026-10-01
time: 06:59
status: planned
branch: codex/production-navigation-diagnostics
---

## What changed

Amit requested a complete refresh on main before performance implementation. Fetched main twice,
most recently at approximately 06:58 UTC: `ec07a52894ac083fe44fc75fd2c358d5b6703fee` remained the
tip. Read the latest entry for every open topic, the latest completed feature checkpoints, new
release entries, and the actual extension/auth/settings/migration changes.

Merged `origin/main` into this owned diagnostic worktree without conflicts, merge `283b857`.
The shared main checkout is clean at `9a06716` (four commits behind remote) and was left untouched,
as were other agents' branches/worktrees. This task now contains all current main code plus its
three earlier diagnostic/plan entries and the standalone connection probe. No app cache has been
implemented. The [implementation plan](2026-10-01-navigation-performance-implementation-plan.md)
remains the proposed work; the connection investigation stays deferred at Amit's request.

## Main changes since the diagnostic baseline

The previous baseline was `b2213d9`; five commits have landed since:

| Commit / PR                                                        | Change                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `9a06716`, [#120](https://github.com/amitsharmaak/distil/pull/120) | A same-commit Vercel redeploy now builds instead of being mistaken for a docs-only change; enabled the admin configuration to take effect.                               |
| `80e974b`, [#118](https://github.com/amitsharmaak/distil/pull/118) | Extension X1/X2: token-free sign-in, per-browser revocable connections, extension 2.0, Settings → Connected browsers, secure return-to-connect flow, and migration 0015. |
| `64f13e4`, [#121](https://github.com/amitsharmaak/distil/pull/121) | Records the extension release, production sign-in/save/disconnect/reconnect smoke, and admin Invitations/Troubleshooting verification.                                   |
| `482fb75`, [#119](https://github.com/amitsharmaak/distil/pull/119) | Records that Amit applied drop-collections in Production after finding both tables empty.                                                                                |
| `ec07a52`, [#122](https://github.com/amitsharmaak/distil/pull/122) | Records extension private-key storage and corrects the earlier claim: the manifest public key pins the unpacked id; the private key is for signing packed builds.        |

Already in the baseline: admin invitations I1–I3 (#115), drop-collections code/migration (#114),
the docs-gate Prettier lock fix (#117), iPhone D1–D3 decisions (#116), and earlier P8–P11 performance,
inline search/life areas, keyboard navigation and research readability work. Those earlier feature
plans are closed; the client cache proposal is additional work, not a rerun of P8–P11.

### Current capture/auth contract

- Browser connections use `capture_tokens.kind = browser`; the iPhone/manual token remains
  `manual`. Regenerating the manual token no longer revokes browser connections. Browser
  disconnect revokes one browser independently. The new list/mint/revoke API is
  `/api/v1/extension/connections` and `/:id`.
- `/extension/connect` is a public shell with fresh account verification and a ten-minute,
  single-use extension handoff state. Magic-link return navigation is carried in a sealed
  short-lived cookie. Extension queues are isolated by origin/account; rejected credentials
  trigger sign-in again while preserving queued saves.
- `ConnectedBrowsers` adds a mount-time request to Settings → Capture. Future cache work must
  preserve fresh security checks and immediate disconnect feedback; connection minting, raw
  tokens, admin authorization and account-state reads do not inherit content-cache TTLs.
- Migration 0014 is drop-collections; 0015 is browser-connections, depending on 0014. Both are
  recorded as applied to Production. Do not rerun or renumber them. The next available migration
  number on current main is 0016; the old phone plan's 0015 filename is superseded.

## Live verification versus recorded evidence

Freshly checked through GitHub and public HTTP, approximately 06:55–06:58 UTC:

- Main `ec07a52`: quality-gate success via Docs gate run `36826788131`.
- Latest runtime commit `80e974b`: Quick gate `36824638358` and Docs gate `36824638394` success;
  Vercel status success and Production deployment `6777708799` success.
- Production deployment is `dpl_He9DL53Hk6BC8TsvCnh4Gc62uDmY`, associated with `80e974b`.
  `distilai.app/sign-in` and the deployment-specific origin both expose that deployment id and
  the same script asset set. Both health endpoints return 200/ok. Main's three newer commits only
  change state documentation, so the runtime remaining at `80e974b` is expected.
- **Alias discrepancy:** `distil-pv-1850.vercel.app/api/health` is also 200/ok, but its sign-in page
  has a different script asset set and no deployment id. Its exact SHA and alias equivalence are
  unverified; do not claim the legacy alias matches current Production. No alias was changed.
- No open GitHub pull requests or issues at the check time.
- Recent Full-gate workflow entries were skipped, not successful Full-gate runs. The latest
  release checkpoint reports local `npm run check` with 2,082 tests, 13 PostgreSQL integration
  suites, 13 extension tests, isolation and security checks passing; those local runs were not
  repeated in this status-refresh task.

Production DB migration execution, authenticated admin UI, extension capture/disconnect smoke,
and private-key storage are evidence from the newly merged release entries, not independently
re-executed here. No real invitation was issued during the recorded admin verification.

Local runtime: no listener found on port 3000; `distil-local-postgres` is running and healthy on
port 5433. No dev server or container was started/stopped. This conflict-free sync changes no app
code beyond main; formatting, state-log validation and diff checks cover this new checkpoint.

## Effect on the performance plan and remaining work

Research list/detail, Feed/Today server rendering, Feed client, app shell/sidebar, auth provider
cache, request metrics and package dependencies are unchanged from `b2213d9`. No TanStack/SWR
cache or navigation fix has arrived on main. The three implementation slices remain valid, with
the new connection/account flows included in cache-reset and mutation verification.

Other open product work: X3 unlisted Chrome Web Store distribution; iPhone D1–D3 pairing/Shortcut
work (its X1 prerequisite is now fulfilled); the summary-regeneration and knowledge-backfill
handler backlog. The docs-gate topic still has an obsolete Next mentioning PR #115; that PR is
already merged and no longer blocks anything. Extension entries contain explicitly explained
08:00–08:02 ordering timestamps ahead of their actual writing time; use Git chronology for
release order. This refresh does not rewrite other owners' append-only entries.

## Next

When Amit starts implementation, create a new worktree from freshly fetched main, run `npm ci`,
and implement the shared account-scoped cache plus Research first, following the original design
and this refreshed auth/capture contract. Preserve initial SSR and solve route gating as part of
the cached-navigation work. Keep signed-out/extension-connect routes and privileged account actions
outside ordinary content caching. No further transport experiments are planned.

If release housekeeping is requested separately, inspect the legacy alias assignment read-only
before proposing a correction; repointing a Production alias requires task-specific authorization.
No merge to main, push, deployment, migration, credential or cloud-setting change occurred here.
