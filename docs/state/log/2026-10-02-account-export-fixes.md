---
topic: account-export
title: Account export — request feedback, one unfinished export per account, no export left pending
date: 2026-10-02
time: "14:25"
status: in-progress
branch: claude/account-export-fixes
pr: 139
---

## What changed

**Report.** On Production on 2026-10-02 Amit clicked "Request export" on the account page, saw no
reaction, clicked several more times and ended up with eight `account_exports` rows, created within
15 seconds, that all stay `pending` (`updated_at` equal to `requested_at`, no failure code). There
were no earlier exports.

**Root cause, in two parts.**

1. Production has `BLOB_READ_WRITE_TOKEN` but neither `DISTIL_OBJECT_STORE_PROVIDER` nor
   `DISTIL_OBJECT_STORE_ENVIRONMENT`. `getLifecycleObjectStore()` therefore throws, and the queue
   consumer resolved storage before `claimExport`, so the row was never touched: the job failed and
   retried, the export stayed `pending`. **The variables are still unset; setting them is Amit's to
   authorize and is not part of this pull request.**
2. The button had no in-flight state, the notice and errors rendered at the bottom of the page,
   nothing polled, and each click carried a fresh idempotency key, so every click created an export.
   This was never different; it is not a regression from the 2026-10-02 releases.

**What PR #139 changes** (branch `claude/account-export-fixes`, from `origin/main` `340f2b1`):

- `ec3cb2a` Server. `createExport` takes its advisory transaction lock per account instead of per
  idempotency key and, in the same tenant transaction, returns the account's `pending` or `running`
  export if one exists; `requestAccountExport` hands it back with the existing `202` shape and
  `created: false`, without a second quota charge or a second pair of jobs. No migration. The export
  handler marks an export `failed` (`EXPORT_STORAGE_UNAVAILABLE`) when object storage cannot be
  resolved, then fails the job as before so retries continue. Unfinished exports untouched for 15
  minutes are marked `failed` (`EXPORT_STALLED`) when their owner requests, lists or reads exports.
  Failed exports carry a fixed `failureMessage`.
- `10f35fe` Queue. Delayed tenant-job sends set `retentionSeconds` to the seven-day maximum and cap
  the delay at it.
- `2886319` Account page. In-flight state and double-click guard, messages inside the export
  section, the button disabled while an export is unfinished, bounded status polling (every 5 s, at
  most 36 times, stops on a terminal state or unmount), plain text for a failed export.
- `1f5c623` Docs. `docs/vercel-deployment.md` lists the three object-store variables;
  `docs/runbooks/account-export.md` describes dedupe and the terminal states.

**What it does not change.**

- The Production environment. Until the variables are set, an export there ends `failed` with
  "Export storage is not available right now" instead of hanging.
- A Production export has never succeeded end to end. The first one after the variables are set is
  the real acceptance test of the Vercel Blob adapter.
- Delivery of the retention purge. `@vercel/queue` 0.5.1 allows at most seven days for both
  retention and delay, and the purge is delayed by seven days, so the message expires at about the
  moment it becomes visible. The send is now within the documented limits, but the purge still needs
  a dependable trigger (a scheduled sweep of due lifecycle jobs, or re-sending with the remaining
  delay). The account-deletion job has the same seven-day delay and the same limit, and its purge
  needs the same object-store variables.

## Verification

Locally verified on the branch head, 2026-10-02:

- `npm run check`: lint, typecheck, 269 suites / 2404 tests passed.
- `npm run test:integration` (Testcontainers): 15 suites / 78 tests passed, including three new
  lifecycle cases: eight concurrent requests with different keys give one export, two jobs and one
  quota charge (the case fails with the old per-key lock); eight stalled rows turn `failed` past the
  threshold, are untouched before it, leave another tenant's export alone and stop blocking new
  requests; storage unavailable marks the export `failed` and a later delivery completes it.
- `npm run test:phase3-isolation`: 7 suites / 59 tests passed. `npm run audit:phase3-security`:
  passed. `npm run build`: passed.

Not verified: the account page in a browser (the lifecycle routes need hosted Neon Auth, which the
local loop does not run); CI on the pull request; anything on Preview or Production. Whether Vercel
Queues rejected the earlier seven-day delayed sends could not be determined from code. The
Production facts above (eight rows, missing variables) were established by the orchestrating session
and were not re-checked here.

## External resources

None touched. Pull request 139 on `amitsharmaak/distil`, labelled `full-ci`.

## Next

1. Amit: review PR #139 and merge when the Quick gate and Full gate are green. The merge is a
   Production release.
2. Amit: authorize and set on Vercel Production `DISTIL_OBJECT_STORE_PROVIDER=vercel-blob` and
   `DISTIL_OBJECT_STORE_ENVIRONMENT` (a lowercase label such as `production`, not shared with
   Preview); `BLOB_READ_WRITE_TOKEN` is already there. Redeploy afterwards.
3. Verify on `distilai.app` after the deploy, signed in as Amit:
   - Open Account. The eight old rows show `failed` with "This export did not finish".
   - Click "Request export" once: the button shows "Requesting export…", then stays disabled with
     "An export is in progress", and one new row appears.
   - Before the variables are set, that row turns `failed` with the storage message within about a
     minute and the button is enabled again. After they are set, it turns `ready`, the Download link
     returns a ZIP, and `account_exports` has exactly one new row.
   - Clicking quickly several times still creates one row.
4. Decision for Amit: how the seven-day purge of export objects (and the account-deletion job) should
   be triggered, given the queue's seven-day limit. Until then, exported ZIPs may outlive
   `purge_after` in the Blob store; downloads still stop after 24 hours.
