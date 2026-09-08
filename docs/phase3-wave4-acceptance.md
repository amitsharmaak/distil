# Phase 3 Wave 4 acceptance

## Purpose

Wave 4 is the final evidence wave for the Phase 3 exit gate. It does not add product scope and it
does not authorize account activation. It proves that the frozen Wave 3 implementation remains
tenant-safe under realistic concurrency, bounded load, deterministic infrastructure failures, and
the complete supported-client regression corpus.

Wave 4 starts from Wave 3 implementation freeze
`290817cc9d1124141ce18b3b0018e9e5345d63d3` and state checkpoint
`05e1751a0ee115b5fec09231a1a186c7b167987e`. Every rollout flag remains false until all gates below
are accepted together at one immutable SHA.

## Workstreams and gates

### 1. Database and application performance

- Exercise recent feed, full-text search, export, and deletion lookups through the restricted
  runtime role with two unrelated tenants and transaction-local context.
- Inspect real PostgreSQL plans after representative multi-tenant seeding. Every plan must visibly
  retain the tenant predicate before row return; plan regressions use structural/index budgets, not
  runner-specific wall-clock thresholds.
- Record bounded-load latency distributions separately for capture acknowledgement, feed/search,
  queue claim, and lifecycle status. A measurement is evidence, not a CI assertion, unless its
  environment and dataset are pinned.
- Prove connection-pool context cleanup and useful progress for both tenants under concurrent load;
  no starvation, cross-tenant result, or leaked session setting is acceptable.

### 2. Deterministic failure and recovery

- Inject failures before and after queue claims, object writes, provider identity deletion, database
  checkpoints, and terminal acknowledgement.
- Replay export, deletion, capture, and durable jobs. External irreversible effects occur at most
  once; partial exports never become downloadable; forged owners have no effect.
- Exercise database unavailability, object-store unavailability, and provider timeout/retry without
  sleeps or probabilistic timing. Recovery resumes from durable checkpoints and fails closed when a
  required adapter is absent.

### 3. Independent two-user adversarial acceptance

- Use two fresh synthetic accounts controlled by the test operator, never Amit's identity.
- Cover every matrix surface and worker in both directions, including identifier guessing, nested
  resource mixing, capture tokens, queues, retrieval/ranking, AI context, exports, deletion, quotas,
  logs, and private object keys.
- Compare foreign and missing resources for indistinguishable status/body and verify no side effect,
  provider call, queue dispatch, object creation, prompt inclusion, or timing-derived enumeration.
- Run the acceptance against an isolated Preview deployment and disposable database branch only
  after local deterministic gates pass.

### 4. Full regression and evidence freeze

- Pass lint/format, TypeScript, dependency and Phase 3 security audits, unit/component/contract,
  coverage, every PostgreSQL integration suite, production build, extension E2E, and desktop/mobile
  browser E2E.
- Re-run migration/restore and lifecycle evidence validators against the accepted SHA. Wave 3's
  private evidence remains immutable; Wave 4 writes a separate content-free evidence bundle.
- Record exact code SHA, CI run, Preview deployment, database branch, dataset profile, performance
  observations, injected-failure matrix, adversarial results, and rollback result in
  `docs/project-state.md`.

## Stop conditions

Stop the wave and keep all flags false on any cross-tenant observation or mutation, unbounded or
non-idempotent replay, missing tenant predicate, unexplained material performance regression,
incomplete supported-client regression, evidence/SHA mismatch, or dependency/security audit
finding. Preview promotion, invitations, Production migration, and real-user linking remain separate
operator decisions after Wave 4 acceptance.

## Execution order

1. Land deterministic PostgreSQL plan/concurrency checks against real runtime roles and repositories.
2. Wire failure injection to the real capture, queue, export, deletion, object, and provider adapters.
3. Run the complete local regression corpus and resolve findings.
4. Run independent synthetic A/B acceptance on an isolated Preview clone.
5. Freeze one SHA, obtain green CI for it, validate the content-free evidence bundle, and record the
   Phase 3 exit decision.
