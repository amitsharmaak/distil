---
topic: iphone-shortcut-token
title: iPhone pairing D1-D3 implemented and locally verified; release awaits Amit
date: 2026-10-01
time: 07:38
status: in-progress
branch: codex/iphone-shortcut-pairing
---

## What changed

D1, D2 and D3 ship as one branch and one PR, from `origin/main` `4d06290` (X1/X2 and X3
already merged). Implementation is complete; local verification passed. Release and physical
Shortcut distribution are unfinished. The single PR for this branch is discoverable from
[the branch PR listing](https://github.com/amitsharmaak/distil/pulls?q=is%3Apr+head%3Acodex%2Fiphone-shortcut-pairing).

The [shared contract](../../iphone-shortcut-pairing-contract.md) was committed before delegation
(`6e9d0ae`, clarified in `37b4346`). It records exact API shapes and non-overlapping file
ownership. Migration `0016_phone_pairing.sql`, stage `phone-pairing`, requires
`browser-connections`; it adds the `phone` kind, RLS-protected `shortcut_pairings`, an exact-hash
identity resolver and a restricted durable anonymous rate limiter. Codes last ten minutes and
are single-use; issuance and consumption share a transaction. Account-first locking closes
suspension/deletion races. Manual regeneration, browser connections and independent phones leave
each other active. Pairing hashes are excluded from account exports.

Settings now reads manual token / Connected browsers / iPhone Shortcut, with an optional install
link, code countdown, expiry, bounded refresh while pairing, device list and Disconnect. D3 docs
explain install → pair → share, automatic `UNAUTHORIZED` recovery, and Amit's signing/publishing
steps. `NEXT_PUBLIC_IOS_SHORTCUT_URL` is unset locally; its link is hidden. The fixed iCloud file
can share a credential between devices on the same Apple Account; it is not hardware-bound.

**Contract clarification:** exact-hash lookup cannot identify a pairing from an unknown wrong
code. The orchestrator asked about this and proceeded with the stated recommended assumption
without receiving a different answer: unknown guesses count against `pairing:${ip}` (stored as
a hash, ten requests per fifteen-minute database-clock bucket); five failed hash rechecks on an
identified pairing consume that row. No approximate lookup or pending-code enumeration was added.

## Ownership and commits

The orchestrator wrote the shared contract, integrated, reviewed and independently verified; all
feature implementation belonged to sub-agents in isolated worktrees. A/B/C ran first; D/E used
freed slots. Integration order was A → B → C → D → E, then F. G reviewed read-only.

- A, schema/migration/inventory: `6285ff5`; missed schema test expectations fixed in `1c7b082`
  (integrated as `b4a0eb1`).
- B, domain/repositories: `edebf1a`, lifecycle/expiry race correction `594f86b`.
- C, routes/rate-limit/lifecycle: `743c333`; typed test fixture correction `27de574`
  (integrated as `add4f8b`).
- D, Settings UI: `61b5c8b`.
- E, Shortcut and deployment docs: `24f3e6c`.
- F, PostgreSQL integration/race tests: `2a4f0d6`.
- G, independent review of implementation at `b4feab0`: no actionable findings. Later changes
  were test-only. Integrated implementation and tests are at `d901a7b` before this log commit.

## Verification

Run independently by the orchestrator in the integration worktree:

- `npm run check`: 258 suites, 2,160 tests passed; lint has five existing warnings, zero errors.
  A missing test-fixture owner and three stale schema assertions were fixed before the passing run.
- `npm run test:phase3-isolation`: seven suites, 59 tests passed.
- `npm run audit:phase3-security`: passed.
- `npm run test:integration`: all 15 PostgreSQL suites, 74 tests passed, fresh Testcontainers.
  Includes ten new pairing tests: RLS isolation, independent token kinds, concurrent exchange and
  replacement, five-attempt persistence, expiry/replay, rollback without an orphan token, and real
  account-row lock coordination with deletion/suspension.
- Fresh local Docker database applied every stage through `phone-pairing`.
  `npm run db:tenant:verify -- --amit-user-id <local-test-uuid> --stage rehearsal --through phone-pairing --output <local-report>`
  passed using the task's `.env.local.docker`. Stage-sensitive JSON classification also preserves
  expand-only verification.
- In-app browser: signed in, Settings card at desktop and 375 × 812 px, light/dark, no horizontal
  overflow, zero console errors. Install link hidden when unset. Pairing code and countdown shown;
  successful exchange automatically clears the code and lists the phone; Disconnect removes it.
- `curl` stood in for the Shortcut: sessionless exchange, single-use rejection, capture accepted,
  legacy manual-token capture accepted after pairing, manual regeneration preserving the phone,
  Settings Disconnect followed by capture `401 UNAUTHORIZED`, and the new manual token still
  accepted. No live credentials or pairing codes were printed.
- Typecheck passed again after F's integration-test file was added.

Not locally verified: physical iPhone actions/import/signing/iCloud distribution, the installed
legacy Shortcut itself, hosted Neon Auth execution, Preview or Production. Legacy Shortcut
compatibility above is an API simulation. Full web/mobile/extension E2E and production build are
requested from CI via `full-ci`. External CI is pending when this entry is written; check the PR's
exact head and checks before release. Prior X1 Production evidence was read as history only.

## External resources

No Vercel, Neon or Production operation. Local-only container `distil-iphone-pairing-local`,
throwaway Testcontainers, and the task's ignored environment files. One GitHub PR is opened after
this checkpoint with the `full-ci` label. Final external results belong to that PR's checks.

## Next

1. Finish the single PR's CI and stop for Amit's task-specific release authorization. This follows
   AGENTS §9 and the explicit task instruction: merge auto-deploys, and the migration is a Neon
   mutation. Do not enable auto-merge.
2. After authorization, **Amit** loads his owner connection privately and performs the read-only
   Production pre-check: ledger ends with `browser-connections`, ownership is expected, the new
   objects are absent, and existing capture-token counts are recorded without reading secrets.

   ```sql
   BEGIN READ ONLY;
   SELECT stage, name FROM distil_tenant_migrations ORDER BY name;
   SELECT tablename, tableowner FROM pg_tables
     WHERE schemaname = 'public' AND tablename IN ('users', 'capture_tokens');
   SELECT kind, count(*) FROM capture_tokens GROUP BY kind ORDER BY kind;
   SELECT to_regclass('public.shortcut_pairings'),
     to_regclass('public.shortcut_pairing_rate_limits'),
     to_regprocedure('public.distil_resolve_shortcut_pairing(text)'),
     to_regprocedure('public.distil_consume_shortcut_pairing_rate_limit(text)');
   COMMIT;
   ```

3. **Amit** applies the reviewed stage with the same explicit verified owner UUID used for prior
   stages. The connection must already be loaded privately; never paste it into chat:

   ```bash
   npm run db:tenant:migrate -- --stage phone-pairing --amit-user-id <verified-production-owner-uuid>
   ```

4. **Amit** runs the read-only post-check: ledger has `phone-pairing` / `0016_phone_pairing.sql`,
   old token counts are unchanged, new tables exist, `shortcut_pairings` has enabled/forced RLS,
   the same-owner token foreign key and one-pending-code index exist, the kind check includes
   `phone`, both SECURITY DEFINER functions belong to `distil_migration`, PUBLIC cannot execute,
   and runtime has function execution/tenant-view access but no direct new-table access. Run
   `db:tenant:verify -- --amit-user-id <same-uuid> --stage rehearsal --through phone-pairing --output <private-report>`
   with that owner environment. Share only pass/fail and non-secret counts/ledger facts.
5. Only after the stage/post-check succeed and exact-head CI is green may the orchestrator squash
   merge the one PR. Then verify the deployed main SHA, both Production aliases, health, and
   Settings → Capture/iPhone card with no console errors, within Amit's authorization. Add a new
   follow-up state entry for release evidence; do not alter this entry.
6. **Amit's D3 device steps:** build the public Shortcut using the appendix, sign/share its iCloud
   link, set `NEXT_PUBLIC_IOS_SHORTCUT_URL` in Vercel and redeploy, pair the phone, verify first-run
   code prompt, second-share no prompt, Disconnect/re-pair, wrong-code failure, and separate-account
   acceptance on a second device. Keep the existing Shortcut until this passes. Preserve the
   documented same-Apple-Account/iCloud sharing limitation.
7. After verified integration, remove only this task's integration and sub-agent worktrees/branches.
   Until then preserve them. Restart from `/Users/amitsharma/Projects/distil-iphone-shortcut-pairing`,
   run `npm run state -- --topic iphone-shortcut-token`, inspect `git status`, then
   `gh pr list --head codex/iphone-shortcut-pairing` and `gh pr checks <number>`.
