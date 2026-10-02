---
topic: navigation-performance
title: Client performance implementation under one integration owner
date: 2026-10-01
time: "07:45"
status: in-progress
branch: codex/client-navigation-performance
---

## What changed

Amit authorized implementing the complete plan with smaller sub-agents and one final PR.
The root Codex session owns integration, shared client caching, navigation, mutations and
verification. Research API and Research/Archive clients have separate owners; the API owner
then handles Feed/Today, and the navigation reviewer handles reader startup. Each uses a
dedicated worktree. All questions and integration return to root; agents do not push, open
PRs, merge main or deploy. The main checkout and other task branches remain untouched.

Started from `origin/main` at `ec07a52894ac083fe44fc75fd2c358d5b6703fee`, installed dependencies,
and retained the previous diagnosis and implementation plan in this branch. Research server
commit `5d7e98f` is integrated as `ff20ffa`. The shared cache uses per-account memory only,
abortable deduplicated requests, stale data during refresh, explicit refresh, and bounded
retention. The separate connection-stall investigation remains deferred.

## Verification

Research server slice previously verified locally by its owner: Quick gate passed (251 suites,
2,088 tests), including projection, tenant boundary, stale-run handling and decoded payload
below 5 kB. Final integration checks remain pending. No new deployment or Production claim.

## External resources

None changed. Package registry reads only.

## Next

Finish shared cache and session-isolation tests; integrate Feed/Today, Research/Archive and
reader startup. Validate request counts, refresh/mutations, route prefetch, mobile/desktop
navigation and bundle cost. Root opens one final PR after integration verification; main merge
and release remain separate steps controlled here.
