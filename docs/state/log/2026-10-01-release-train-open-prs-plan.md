---
topic: release-train
title: Release plan for the seven open PRs (#125, #128–#133) as phases R1–R8; decisions A–E open
date: 2026-10-01
time: 10:14
status: planned
branch: claude/pr-merge-deploy-plan-32c055
---

## What changed

Docs only. Amit asked for a plan to merge and release the seven open PRs and for it to be recorded
here. Seven read-only review agents examined the PRs on 2026-10-01 with `main` at `5fe4369`. This
entry records their findings as standalone phase briefs (R1–R8) and lettered decisions (A–E).

**Nothing has been authorized.** Amit has not answered decisions A–E and has not approved any
merge, migration, environment change, deployment or store upload. No PR was merged, labelled or
changed, and no Vercel or Neon resource was read or touched while writing this plan.

## Facts that frame every phase

- **Each code merge is a Production release.** A squash merge of a code PR to `main` deploys to
  Production through Vercel's Git integration while the release pin is `unpinned`. The docs say
  that is the current intent; the live pin value was not read. Docs-only merges skip the build.
  The plan is therefore five Production releases in series (R2, R4, R5, R6, R7).
- **After each merge, every remaining PR must run `git merge origin/main` (never rebase) and
  re-run CI.** PRs are squash-merged.
- No PR is stacked on another; all seven merge cleanly against `main` alone. There is no stray
  unmerged work outside the seven PRs. One Codex worktree (`distil-perf-baseline`) has an
  uncommitted change: leave it alone.
- Only #125 has a migration (`0016_phone_pairing.sql`, stage `phone-pairing`; 0016 is the next
  free number).
- #125, #129 and #130 have run the full CI gate green (`full-ci` label). #132 and #133 have not.
- **Pairwise conflicts (trial merges).** The total is 29 conflicted files in any order; the order
  only decides which PR absorbs them.

  | Pair      | Conflict                                                                                                                 |
  | --------- | ------------------------------------------------------------------------------------------------------------------------ |
  | #129×#132 | 22 files, about 47 hunks, plus a modify/delete on `dashboard/__tests__/priority-feed.component.test.tsx` (accept delete) |
  | #132×#133 | 4 files: `app/login/page.tsx`, `auth/sign-in-card.tsx`, `layout/sidebar.tsx` and its test                                |
  | #129×#133 | 1 hunk in `layout/sidebar.tsx`                                                                                           |
  | #125×#129 | 1 hunk in `AGENTS.md`                                                                                                    |
  | #125×#132 | 1 hunk in `capture/token-settings.tsx`                                                                                   |
  | #130×#132 | 1 hunk in `capture/capture-diagnostics.tsx`                                                                              |

- **Smoke after every deployment:** `distilai.app` serves the merged commit; `/api/health` returns
  200 with `no-store`; sign in; a capture goes 202 → queued → ready; Today, Feed and Settings show
  no console errors.
- **Rollback:** promote the previous Vercel deployment. The #125 migration is additive and is not
  reversed.

## Decisions (all open on 2026-10-01)

- **A. Triage on first deploy (R2).** Recommended: `FEATURE_CAPTURE_TRIAGE=shadow`, set in Vercel
  before the merge. Alternative: enforce from the start (flag unset). Trade-off: accuracy evidence
  is 27 hand-written fixtures and no real-library evaluation, so enforcing risks rejecting real
  pages that most users cannot recover (see R2); shadow delays the junk filter by one env change
  and redeploy.
  **Shadow does not hold back the priority score.** Checked on `origin/claude/capture-triage`:
  `shadow` only disables rejection (`src/lib/capture/worker.ts:497`). For a capture with the
  default `medium` priority the score is still turned into a bucket (`worker.ts:529-532`), stored
  on the item (`worker.ts:554`) and written to `ai_priority_score` and `priority`
  (`worker.ts:564-567`, `src/lib/postgres/repositories.ts:249-250`), which the feed ranks on
  (`src/lib/feed/feed-query.ts:421`). Only `false` skips the call (`worker.ts:472`; flag parsing in
  `src/lib/phase2/feature-flags.ts:20-25`). So in shadow mode new article captures already change
  feed order and the high/medium/low mix; an explicit high or low choice is kept.
- **B. #132 before #129.** Recommended: #132 first, so the unavoidable 22-file conflict lands on
  #129's mechanical cache wiring rather than on a visual rewrite. Alternative: #129 first, which
  ships the performance work sooner because it already has full CI; then #133 takes one sidebar
  hunk and #132 absorbs 24–27 files with a higher risk of silently dropped cache wiring. One
  review agent preferred #129 first; the conflict simulation supports #132 first.
- **C. #133 in this run.** Recommended: yes, so the first Chrome Web Store upload carries the new
  logo. Alternative: hold it and make a second store submission later.
- **D. Who merges.** The `gh` credential in the planning session reported pull-only permission.
  Merges need Amit or another credential.
- **E. Authorizations.** Each code merge (a Production release), the Neon stage for #125, any
  Vercel environment change and the store upload need Amit's task-specific approval. None has
  been given.

## Phases

Each brief stands alone. Amit picks one phase per task. Order is the recommended one (decision B
swaps R5–R6 with R7).

### R1. #128 "docs(state): UI audit and edition-style redesign plan (U1–U5) with Codex prompt"

- **Goal:** merge the audit as a historical record. #132 has already implemented its plan.
- **Preconditions:** none. Docs only; one commit behind `main`.
- **Steps:** `git merge origin/main` on the branch, push, squash-merge.
- **Verification:** no deployment happens. `npm run state` shows #132's entry as the latest for
  topic `ui-modernization` once #132 merges (#128's entry has no `time`, #132's is 09:34, so it
  should sort later).
- **Authorization:** Amit approves the merge (docs only, no release); decision D.
- **Done when:** #128 is merged and `main` is unchanged apart from docs.

### R2. #130 "feat(capture): triage — junk-page check and priority score before the summary"

- **Goal:** release capture triage. Clean against `main`, no migration, full CI green.
- **Flag:** `FEATURE_CAPTURE_TRIAGE`: unset = enforce (junk captures end `rejected` with
  `CONTENT_JUNK`), `shadow` = score and record but never reject, `false` = off. A change takes
  effect only on the next deployment.
- **Preconditions:** decision A answered. If shadow, Amit sets the variable in Vercel before the
  merge.
- **Known limits:** accuracy evidence is 27 fixtures (15/15 junk caught, 0/12 false rejects).
  Guards before a rejection: junk kind, confidence ≥ 0.9, under 3,000 readable characters, no
  notes, not explicit high priority, not a second save of the same URL; triage errors fail open.
  Non-admins cannot see Troubleshooting ("Save anyway"), and it is not confirmed that the
  extension surfaces the asynchronous rejection.
- **Steps:** merge `origin/main` in if behind, confirm CI, squash-merge, wait for the deployment.
- **Verification:** standard smoke, then capture a long article, a short real page, a login wall
  or 404, a YouTube URL and an X URL (the last two are not triaged). Watch the `capture_triage`
  and `capture_triage_skipped` logs, `CONTENT_JUNK` rows, the high/medium/low mix (it shifts even
  in shadow, see decision A) and job duration against the 60 s limit (triage adds up to 8 s).
- **Authorization:** Amit, for the Vercel variable and for the merge as a Production release.
- **Done when:** the deployment serves the merge commit and the five captures behave as expected.

### R3. #131 "docs(ai): intelligence layer map, evaluation framework and plan Q0–Q8"

- **Goal:** merge the intelligence plan after it reflects #130.
- **Preconditions:** R2 merged. Its Q5 specifies the same triage call and
  `docs/intelligence-layer.md` lists the junk check as "Not built".
- **Steps:** on the #131 branch, `git merge origin/main`; update those rows; add a short new log
  entry noting that Q5's triage call and the decision-8A `reprioritize` touchpoint are partly
  delivered by #130; push; squash-merge.
- **Verification:** `npm run lint` passes on the branch. No deployment.
- **Authorization:** Amit approves the merge (docs only).
- **Done when:** #131 is merged with the corrected rows.

### R4. #125 "feat: pair the iPhone Shortcut without copying a token"

- **Goal:** release phone pairing. Code ready, full CI green, two commits behind `main` (merges
  cleanly).
- **Hard order: the Production migration is applied before the merge.** Without it, account
  deletion, suspension and export break, not only pairing. The migration is additive and the
  current Production code runs on the new schema.
- **Steps:**
  1. Amit, with the owner connection: run the pre-check SQL, then
     `npm run db:tenant:migrate -- --stage phone-pairing --amit-user-id <ledger owner uuid>`, the
     post-check SQL, and `db:tenant:verify` through `phone-pairing`. The pre/post SQL is in
     `docs/state/log/2026-10-01-iphone-shortcut-token-d1-d3.md` on the #125 branch.
  2. `git merge origin/main` on the branch, confirm CI, squash-merge, wait for the deployment.
- **Verification (no phone needed):** standard smoke; Settings → Capture shows the iPhone card;
  generate a code and `curl` the exchange (expect a token); replay the code (401); capture with
  the token (202); Disconnect, then the token returns 401; an existing manual token still
  captures; the 11th exchange from one IP returns 429; account export works.
- **Later, outside the repo:** build, sign and publish the Shortcut; set
  `NEXT_PUBLIC_IOS_SHORTCUT_URL` (build-time, needs a redeploy; the card's install link is hidden
  while unset); run the physical-iPhone checklist in `docs/iphone-shortcut.md`.
- **Security read:** low-severity items only: the IP limiter (10 per 15 min) is shared behind
  carrier NAT; it relies on Vercel's `x-forwarded-for`; consumed codes are not pruned.
- **Authorization:** Amit, separately for the Neon stage and for the merge as a Production
  release.
- **Done when:** the stage is verified, the deployment serves the merge commit and the curl
  checks pass.

### R5. #132 "Turn Distil into a daily edition with a text-first reader"

- **Goal:** release the UI rewrite. UI only: no migration, environment, API, auth or extension
  change. The PR body says "Do not merge" pending Amit's approval.
- **Preconditions:** R2 and R4 merged (it re-skins their small additions); Amit's approval of the
  design on a preview.
- **Steps:**
  1. `git merge origin/main`; resolve `capture/token-settings.tsx` (#125) and
     `capture/capture-diagnostics.tsx` (#130) by re-skinning their additions.
  2. Add the `full-ci` label; the full gate has never run on this PR.
  3. `EXPLAIN ANALYZE` the feed query. `src/lib/feed/feed-query.ts` now computes read time from
     `char_length(full_content)` in the SELECT of an `ORDER BY … LIMIT` query, which may de-TOAST
     every body. This is inferred, not measured.
  4. Walk the preview: Today lead and rows with thumbnails and read times; Feed filters,
     pagination and mark-read; the reader for article, X, YouTube and podcast; notes and
     highlights; the `[` shortcut (the sidebar is hidden in the reader on desktop); Settings on a
     phone; login, invite and onboarding pages; light and dark; mobile Safari at 390 px; extension
     and Shortcut captures still land.
  5. Squash-merge and wait for the deployment.
- **Other noted risks:** remote thumbnails are not proxied (`http:` is blocked by the CSP and
  leaves an empty box); `formatDate` is fixed to UTC and en-US (off by one day for non-UTC users);
  the title and excerpt heuristics in `display.ts` are tested on fixtures only.
- **Verification:** full gate green; standard smoke; repeat the walk on Production.
- **Authorization:** Amit, for the design approval and for the merge as a Production release.
- **Done when:** the deployment serves the merge commit and the walk is clean.

### R6. #133 "Apply approved Distil logo across app and extension" (draft)

- **Goal:** release the logo (decision C). Implementation is complete; it is a draft only because
  review, release and the store upload are pending and it must reconcile with #132.
- **Preconditions:** R5 merged.
- **Steps:** `git merge origin/main`; in the four conflicted files replace #132's `BrandMark` with
  `DistilLogo`; delete `layout/brand-mark.tsx`; add `full-ci`; mark ready; squash-merge.
- **Verification:** in light and dark: favicon at 16 and 32 px; sidebar expanded and collapsed;
  `/login` and `/sign-in`; installed PWA and iOS icon and the Android maskable crop; the new PWA
  theme colour; extension toolbar icon, popup and options; the store promo tile.
- **After the release:** `npm run extension:pack` and the Chrome Web Store upload (Amit's). The
  log records the first upload as still pending; if 2.0.0 was already uploaded, a version bump is
  needed. `DISTIL_EXTENSION_IDS` changes only after a store upload.
- **Authorization:** Amit, for the merge as a Production release and for the store upload.
- **Done when:** the deployment serves the merge commit and the icon checks pass.

### R7. #129 "perf: cache navigation data and remove repeat reads on tab changes"

- **Goal:** release navigation caching last. Full CI is green today, but after #132 it absorbs 23
  conflicted files.
- **Preconditions:** R5 and R6 merged. Needs the author's judgment, not a mechanical resolution.
- **Steps:**
  1. `git merge origin/main` and re-apply the cache, `IntentLink` and `useItemMutation` wiring
     onto #132's `story-card.tsx` and `reader-experience.tsx`. Taking one side silently drops the
     caching while its tests are also in conflict.
  2. Restyle the `feed/[id]/loading.tsx` and `research/loading.tsx` skeletons for the new shell.
  3. Regenerate the lockfile (`@tanstack/react-query` here, `sharp` from #133).
  4. Run the full gate, plus `DISTIL_E2E_PRODUCTION=1` for `tests/e2e/content-cache.spec.ts`
     (three of its five tests skip without it).
- **Preview checks before release:**
  - (a) Two-account isolation: sign in as A; visit Today, Feed, the reader, Research and Archive;
    sign out; press Back and Forward: no A content. Sign in as B in the same tab: only B's data.
    `next.config.ts` raises `experimental.staleTimes` from 30/300 to 1800/1800 and sign-out uses
    `router.replace` plus `router.refresh()` rather than a full reload, so this path is an
    untested, inferred risk.
  - (b) Signing out in another tab shows the session-changed screen.
  - (c) Stale data: a capture from web, extension or Shortcut appears within two minutes or on
    refocus; mark read, archive and area changes show everywhere; a new summary shows after
    leaving and returning. Reader pages can be stale for up to 30 minutes for changes from another
    device or a background job.
  - (d) `/privacy` and `/sign-in` load when logged out (the root layout now reads `headers()`,
    which probably makes static pages dynamic).
- **Design note:** the cache is client-side, memory-only and keyed by user id; there is no shared
  server cache.
- **Verification after deploy:** standard smoke; compare request counts and click-to-content time
  on Production.
- **Authorization:** Amit, for the merge as a Production release.
- **Done when:** the deployment serves the merge commit and checks (a)–(d) pass on Production.

### R8. Close-out

- **Goal:** record the evidence and settle what the releases left open.
- **Steps:** add a new state-log entry with the release evidence for R1–R7; decide when triage
  moves from `shadow` to enforcing (environment change plus redeploy); build and publish the
  Shortcut and run the device checklist; optionally remove merged local branches and worktrees.
- **Authorization:** Amit, for the triage flag change and redeploy.
- **Done when:** the topic's latest entry has status `released` or `closed`.

## Verification

- Locally verified for this entry: the shadow-mode behaviour in decision A, by reading the cited
  files on `origin/claude/capture-triage`; `npm run lint` on this branch.
- Reported by the review agents and not re-checked here: CI status and labels, the trial-merge
  conflict counts, commits behind `main`, and every risk marked as inferred.
- Not read: the live release pin, Vercel environment variables, Neon.

## External resources

None touched.

## Next

- Amit answers decisions A–E, then picks one phase per task, starting with R1.
- Nothing proceeds without his task-specific approval for that phase (decision E).
