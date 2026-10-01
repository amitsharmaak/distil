---
topic: navigation-performance
title: Research list projection and GET route timing ready for integration
date: 2026-10-01
time: 07:05
status: in-progress
branch: codex/perf-research-data
---

## What changed

Implemented the bounded server portion of the first navigation-performance slice from
`2026-10-01-navigation-performance-implementation-plan.md`. The Research repository now has a
dedicated `listReportSummaries` projection for list cards. PostgreSQL selects only report id,
optional item id, query, status, creation/completion timestamps and internal progress needed to
detect abandoned runs; the full `listReports` method remains unchanged for proactive-research and
compatibility consumers.

`GET /api/ai/research/list` returns only explicit card fields and never serializes the report body,
sources, model or raw progress. It retains the 50-row limit, newest-first repository ordering and
`failStaleReport` behavior. The Research list, detail and suggestions GET routes now use the shared
request-metrics wrapper, exposing safe auth/database/total timing phases when those phases run.
List and suggestions remain separate contracts because they have independent mutation and cache
invalidation lifecycles.

This session owns only the three Research GET routes, the Research repository projection and its
focused tests. The integration owner owns the shared client cache, routing, final PR and merge.

## Verification

Locally verified in `/Users/amitsharma/Projects/distil-perf-research-data` from base
`ec07a52894ac083fe44fc75fd2c358d5b6703fee`:

- `npm ci` succeeded before edits.
- `npm run check` passed: lint and state validation, TypeScript, and all 251 deterministic Jest
  suites (2,088 tests). Lint retained four known warnings and reported zero errors.
- Focused Jest suites passed: 3 suites and 35 tests covering projection columns/order/limit,
  tenant-transaction binding, card-only serialization, representative five-row payload below
  5 kB decoded, stale-run failure repair, authorization on all three GET routes and timing headers.
- `git diff --check` passed before this entry was added.

No CI, PR, merge, deployment or Production behavior was run or verified in this session.

## External resources

None. No hosted database, provider, Production endpoint or cloud configuration was accessed.

## Next

Integration owner: integrate the committed branch into the single navigation-performance PR,
resolve any client response-type overlap around the explicit card contract, and run the combined
Quick gate. Preserve `listReports` for proactive research. No deployment or cloud mutation is
authorized by this checkpoint.
