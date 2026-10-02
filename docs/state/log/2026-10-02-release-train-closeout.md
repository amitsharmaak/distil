---
topic: release-train
title: Release train close-out — #125 and #128–#136 merged and deployed; follow-ups listed for Amit
date: 2026-10-02
time: "13:20"
status: released
branch: claude/release-train-closeout
---

## What changed

Docs only. This is phase R8 of `2026-10-01-release-train-open-prs-plan.md`: the evidence for
R1–R7, recorded by the session that ran the plan on 2026-10-02. All times are UTC. Details that
another entry already holds are linked, not repeated.

### Decisions taken by Amit

- **A.** Triage is enforced from day one: `FEATURE_CAPTURE_TRIAGE` stays unset and no Vercel
  environment variable was changed. (The plan recommended `shadow`.)
- **B.** #132 before #129.
- **C.** #133 shipped in this run.
- **D.** Merges were done from the session under the `amitsharmaak` `gh` account.
- **E.** Amit authorized driving the whole plan, ran the Neon stage himself and approved #132's
  UI.

### Merges, in order (squash commits on `main`, times from `gh`)

| PR   | Commit    | Merged (UTC) | What                                          |
| ---- | --------- | ------------ | --------------------------------------------- |
| #134 | `be1791d` | 08:15        | The plan entry (docs)                         |
| #128 | `57112b4` | 08:17        | R1: UI audit (docs)                           |
| #130 | `1b5133e` | 08:22        | R2: capture triage                            |
| #131 | `a2b800e` | 08:32        | R3: intelligence plan (docs)                  |
| #125 | `8d088c4` | 08:46        | R4: iPhone pairing                            |
| #132 | `e23b8fe` | 11:43        | R5: daily edition UI                          |
| #133 | `73e670e` | 11:57        | R6: logo                                      |
| #129 | `bbad825` | 12:43        | R7: navigation cache                          |
| #136 | `1716610` | 13:07        | Hotfix for the #129 hydration regression      |
| #135 | `dfaa465` | 13:10        | Store item id added to `DISTIL_EXTENSION_IDS` |

Each code merge deployed to Production (Vercel deployment status success) and
`https://distilai.app/api/health` returned 200 after each. No pull request is open.

### R2, #130 capture triage

Production evidence: a long article was captured, summarized and ranked high; a short real page
was kept (medium); `github.com/login` was rejected with the plain sign-in-page message and the
save-again hint. Not run: YouTube and X captures, the save-again override. One
`POST /api/v1/captures` hung for about 44 s and failed in the browser; the retry took under 1 s.
The cause was not established (see "Unexplained" below).

### R3, #131 intelligence plan

Its living document and a new entry (`2026-10-02-intelligence-layer-capture-triage.md`) were
corrected before the merge to say triage is delivered by #130.

### R4, #125 iPhone pairing

- **Migration.** Amit applied tenant stage `phone-pairing` (`0016_phone_pairing.sql`) to
  Production before the merge, with the owner connection copied from the Neon console; the session
  never saw it. The owner id is the recorded owner UUID in `docs/project-state.md`.
- **Read-only pre-check:** the ledger ended at `browser-connections`, the new objects were absent,
  tokens were 2 browser and 4 manual. **Post-check:** `phone-pairing` is in the ledger, the four
  objects are present, the counts are unchanged.
- **Catalog check:** `shortcut_pairings` has RLS enabled and forced with policy
  `shortcut_pairings_tenant_isolation`; `shortcut_pairing_rate_limits` has no RLS (as the migration
  declares) and no runtime grants; both functions are `SECURITY DEFINER`, owned by
  `distil_migration`, not executable by `PUBLIC` and executable by `distil_runtime`;
  `distil_runtime` has no direct grants on either table; `capture_tokens_kind_check` includes
  `phone`; the new unique indexes and foreign keys are present.
- **Correction to the #125 runbook.** This command fails on live Production with 17 failures:
  `npm run db:tenant:verify -- --stage rehearsal --through phone-pairing`. All are `WRONG_OWNER` or
  `UNIQUENESS_COLLISIONS` data-ownership checks from the single-owner rehearsal; Production is
  multi-user and none of them concerns the stage. It is not a valid Production post-check; use the
  catalog checks above. The report also said that all 6 capture tokens do not belong to the
  supplied UUID. That was not investigated.
- **After the deployment:** Settings → Capture shows the iPhone card; "Pair this iPhone" returned
  201 with a code and countdown; an exchange with a wrong code returned 401; unauthenticated code
  generation returned 403.
- **Not verified:** a real exchange, a capture with a phone token, Disconnect, account export, the
  429 limit, anything on a physical iPhone. The Shortcut itself is not built or published and
  `NEXT_PUBLIC_IOS_SHORTCUT_URL` is unset. Implementation detail is in
  `2026-10-01-iphone-shortcut-token-d1-d3.md`.

### R5, #132 daily edition UI

- Before the merge it was synced with `main` twice (after #130 and after #125), given the
  `full-ci` label (the first full gate run on it; green) and given the feed read-time fix: a local
  measurement at 5,000 items showed 24 ms → 622 ms, fixed by computing read time after the page
  limit. See `2026-10-02-ui-modernization-main-sync-read-time.md` and
  `2026-10-02-ui-modernization-main-sync-pairing-card.md`.
- The Vercel preview could not be used for sign-in. The Preview environment's
  `DISTIL_ALLOWED_ORIGINS` is `https://distil-preview-pv-1850.vercel.app`, which serves a
  mid-September deployment, so per-deployment preview URLs reject sign-in with "Request origin is
  not allowed". Amit approved the UI on a local run (throwaway Postgres, fictional seed data).
- Production after the deployment: Today, Feed with thumbnails, the reader and Settings load with
  no console errors.
- Open question for Amit: #132 drops the "Item priority" line from the feed rank explanation; a
  #130 test assertion was aligned to that.

### R6, #133 logo and the store draft

- Reconciled after #132 (`DistilLogo` replaces #132's `BrandMark`; `brand-mark.tsx` deleted), full
  gate green, merged. See `2026-10-02-logo-direction-sync-after-ui-rewrite.md`.
- Verified on Production: sidebar logo, favicon, `icon.svg`, the 192 px icon, `logo.svg` and the
  manifest (theme `#172329`). The mobile top bar still shows the serif text "distil".
- `distil-extension-2.0.0.zip` was built from `73e670e`. Amit uploaded it as a draft item, id
  `malhlcmmheemmdebmjpgliligpjlnama`, with the listing filled from `STORE.md` and visibility
  Unlisted. It is **not yet submitted**. The Claude in Chrome extension cannot script Chrome Web
  Store pages, so Amit filled the dashboard by hand.
- #135 added the id to `DISTIL_EXTENSION_IDS` and is deployed
  (`2026-10-02-chrome-extension-web-store-store-id.md`). `DISTIL_EXTENSION_INSTALL_URL` still
  points at the development id.

### R7, #129 navigation cache, and the regression it caused

- Synced after #132 and #133 with the cache re-wired onto `story-card` and `reader-experience`;
  sign-out changed to a full document navigation
  (`2026-10-02-navigation-performance-main-sync-ui-rewrite.md`). An independent review found no
  isolation problem but two defects, fixed before the merge: sign-in showed the "session changed"
  notice, and a note or highlight could be overwritten after cache eviction. Four follow-ups are
  recorded in `2026-10-02-navigation-performance-review-fixes.md`.
- **Production regression.** After release, Today and Feed logged hydration error #418 from the
  "Updated HH:MM" time (server in UTC, browser in local time), which also stripped the `dark`
  class from `<html>`. It was live for roughly 25 minutes (#129 merged 12:43, #136 merged 13:07)
  and was fixed forward by #136: an `UpdatedTime` component, the theme provider re-applies the
  stored theme, and e2e runs the server in UTC and the browser in Asia/Kolkata. Cause and fix are
  in `2026-10-02-navigation-performance-updated-time-hydration.md`.
- Verified after #136: Today and Feed load with `<html class="dark">` and no console errors.
- **Lesson:** CI ran the server and the browser in the same timezone and has no signed-in user, so
  only the component tests catch this class of fault in CI.

### Unexplained

After the last deployments, one RSC request for `/` returned 503 and one fetch failed outright
among about 25 requests; 16 further requests all returned 200 (slowest 4.5 s). Together with the
44 s capture stall under R2 this matches the intermittent connection stall that the
navigation-performance entries list as deferred (`2026-10-01-navigation-performance-final-review.md`).

## Verification

- Derived for this entry from `gh` and git on 2026-10-02: the ten merge commits and merge times
  above, `origin/main` at `dfaa465`, and no open pull requests.
- Reported by the orchestrating session and not re-checked here: every Production observation,
  the Vercel deployment statuses, the health checks, the Neon pre-, post- and catalog checks, the
  preview-origin finding and the store dashboard state.
- Local for this branch: `npm run check`.
- Not done by the release train: see the "Not run" and "Not verified" lines above.

## External resources

- Neon Production: tenant stage `phone-pairing` applied by Amit. No other database change.
- Vercel: Production deployments from the Git integration for each code merge. No environment
  variable was changed by the session.
- Chrome Web Store: draft item `malhlcmmheemmdebmjpgliligpjlnama`, Unlisted, not submitted.

## Next

The plan is executed. The topic is released; what remains is for Amit and belongs to the topics
named. The latest entries of `ui-modernization`, `logo-direction` and `navigation-performance`
were written before their merges and still read `in-progress`; whoever next touches those topics
should add an entry with the released status.

1. `chrome-extension-web-store`: press Submit for review in the Chrome Web Store. After approval,
   verify install → sign in → connect → save from the store build and update
   `DISTIL_EXTENSION_INSTALL_URL`.
2. `navigation-performance`: the sign-out → Back check with real accounts on Production, including
   iPhone Safari.
3. `iphone-shortcut-token`: click Export once in Settings → Account (the export path now touches
   `shortcut_pairings`).
4. `iphone-shortcut-token`: build, sign and publish the iPhone Shortcut, set
   `NEXT_PUBLIC_IOS_SHORTCUT_URL`, redeploy and run the device checklist in
   `docs/iphone-shortcut.md`.
5. `ui-modernization` / `logo-direction`: decide the rank-explanation question (the dropped "Item
   priority" line) and the mobile top-bar wordmark.
6. `intelligence-layer`: review a few days of `capture_triage` logs and `CONTENT_JUNK` rejections;
   enforcement is on with only fixture-level accuracy evidence.
7. The stale Preview alias and allowed-origin setup, which blocks sign-in on preview deployments.
8. Investigate the intermittent 503 and stall.
9. Codex's local worktrees for the merged branches are behind origin and can be removed.
