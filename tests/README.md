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
