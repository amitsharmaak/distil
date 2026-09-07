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

## Phase 3 isolation

The reusable two-tenant fixtures, authorization-matrix validator, migration
invariant checks, pooled-connection RLS harness, forged queue inputs, and
negative-test catalog are described in
[`docs/phase-3-isolation-testing.md`](../docs/phase-3-isolation-testing.md).

The Phase 3 RLS integration suite skips without starting PostgreSQL until
tenant columns, RLS enablement, and a policy appear in the production migration
directory. It becomes a failing gate automatically once those migration signals
exist.
