# Test architecture

Distil uses deterministic test boundaries. Normal test and CI commands must not
contact hosted databases, AI providers, connectors, or arbitrary websites.

## Suites

- `*.unit.test.ts(x)` — pure logic
- `*.component.test.tsx` — React Testing Library and jsdom
- `*.contract.test.ts` — public request/response contracts
- `*.integration.test.ts` — PostgreSQL through Testcontainers
- `*.sqlite-integration.test.ts` — temporary SQLite compatibility coverage
- `*.security.unit.test.ts` and `tests/security/*.spec.ts` — security behavior
- `tests/e2e/*.spec.ts` — browser workflows
- `tests/extension/*.spec.ts` — installed extension workflows
- `*.live.test.ts` — opt-in only; never part of normal CI

The root agent owns shared runner configuration and package metadata. Test
support modules, browser harnesses, and feature suites have exclusive owners
during parallel execution.

## Test tiers

Tests are tiered by when they run, not deleted:

- **Tier 0, while editing:** `npm run check:quick` runs `tsc --noEmit` and Jest only for suites
  related to changed files, in parallel. Seconds.
- **Tier 1, before a PR:** `npm run check` runs lint, typecheck and every deterministic Jest
  suite (unit, component, contract, security, sqlite-compat, phase3-isolation) in parallel; about
  a minute locally. The CI "Quick gate" runs it on every PR and push to `main` and is the only
  required status check besides Vercel.
- **Tier 2, nightly and on demand:** `npm run check:full` adds PostgreSQL integration
  (Testcontainers, needs Docker), web/mobile and extension Playwright, and the production build.
  The CI "Full gate" runs the same set plus a non-blocking coverage report at 02:30 UTC on
  `main`, on manual dispatch, and on PRs labelled `full-ci`.

`*.live.test.ts` stays opt-in and outside every tier.

## Phase 3 isolation

The reusable two-tenant fixtures, authorization-matrix validator, migration
invariant checks, pooled-connection RLS harness, forged queue inputs, and
negative-test catalog are described in
[`docs/phase-3-isolation-testing.md`](../docs/phase-3-isolation-testing.md).

The Phase 3 RLS integration suite skips without starting PostgreSQL until the full immutable
Phase 2 + Wave 0 manifest is represented in a production migration with `user_id`, RLS enablement
and force, and policies. It becomes a failing gate automatically once those precise migration
signals exist; a workspace or partial migration cannot activate it.
