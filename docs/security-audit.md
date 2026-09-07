# Phase 1 security and dependency release audit

**Audit date:** 2026-09-07 (Asia/Kolkata)

**Scope:** `codex/phase-1-personal-capture`, Preview release gate

**Status:** Ready for CI verification; production dependency audit is clean

This document reconciles the original 2026-03-11 pre-sharing review with the current Phase 1
architecture. It records no passwords, tokens, connection strings, session secrets, or provider
keys.

## Production dependency audit

The initial `npm audit --omit=dev` refresh reported 10 vulnerable production packages: 8 High and
2 Moderate. Findings and dependency paths were:

| Package            | Severity | Dependency path                                                                                             | Patched/recommended version used |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `axios`            | High     | `@slack/web-api -> axios`                                                                                   | `1.20.0`                         |
| `brace-expansion`  | High     | `jest -> glob -> minimatch -> brace-expansion` (lockfile classification included it in the omit-dev result) | `2.1.4`                          |
| `follow-redirects` | Moderate | `@slack/web-api -> axios -> follow-redirects`                                                               | `1.16.0`                         |
| `form-data`        | High     | `@slack/web-api -> form-data`; older `jsdom -> form-data`                                                   | `4.0.6`; JSDOM path removed      |
| `nanoid`           | High     | `next/postcss -> nanoid`                                                                                    | `3.3.18`                         |
| `next`             | High     | direct dependency                                                                                           | `16.3.4`                         |
| `postcss`          | High     | `next -> postcss`; `@tailwindcss/postcss -> postcss`                                                        | `8.5.23`                         |
| `qs`               | Moderate | `googleapis -> googleapis-common -> qs`                                                                     | `6.16.0`                         |
| `sharp`            | High     | `next -> sharp`                                                                                             | `0.35.4`                         |
| `ws`               | High     | `openai -> ws`                                                                                              | `8.21.3`                         |

Reviewed direct changes:

- Upgraded `next` and `eslint-config-next` together from `16.1.6` to `16.3.4`.
- Upgraded `@slack/web-api` from `7.14.1` to `7.19.0`, retaining the current major version while
  allowing patched Axios and multipart dependencies.
- Upgraded `jsdom` from `22.1.0` to `30.0.1`, removing its vulnerable legacy multipart path. The
  repository requires Node 22, which satisfies JSDOM 30's runtime requirement.
- Refreshed only compatible transitive lockfile versions with non-forcing `npm audit fix
--omit=dev`. `npm audit fix --force` was not used.

Final release command: `npm audit --omit=dev` -> **0 vulnerabilities** (0 Critical, 0 High,
0 Moderate, 0 Low). There are no accepted Moderate production findings.

The unfiltered development-tool audit is not the production release gate and can include findings
inside build/test-only tooling. It should continue to be handled as routine toolchain maintenance;
it does not change the zero-vulnerability production result above.

## Reconciliation of the 2026-03-11 code findings

| #   | Original finding                     | Current disposition                 | Evidence and residual decision                                                                                                                                                                                                                                             |
| --- | ------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | No API authentication                | Closed                              | Signed, expiring web sessions protect private pages/APIs. Capture clients use separately hashed, revocable tokens. Queue and health routes have narrowly defined policies.                                                                                                 |
| 2   | Wildcard CORS                        | Closed for hosted Phase 1           | Production proxy CORS uses exact `DISTIL_ALLOWED_ORIGINS`; session-authenticated mutations also enforce the Origin allowlist. Legacy route-local wildcard response headers do not enable credentialed browser reads and remain only for local/backward-compatible clients. |
| 3   | Plaintext delete password comparison | Closed                              | The old delete-password route no longer exists. Login uses scrypt hashes and constant-time derived-key comparison; attempts are rate-limited.                                                                                                                              |
| 4   | Stored XSS through raw HTML          | Closed                              | Article HTML and formatted plaintext cross `sanitizeArticleHtml` at the render boundary. AI summaries use React Markdown rather than raw HTML. Security tests cover unsafe schemes, tags, attributes, and link/image transformations.                                      |
| 5   | SSRF in URL fetching                 | Closed for the durable capture path | Capture accepts only HTTP(S), rejects credentials/private/reserved targets, resolves every hop, pins the verified address, limits redirects/body/time, and prevents DNS-rebinding fetches. Hosted legacy capture delegates to this path.                                   |
| 6   | OAuth tokens stored in plaintext     | Deferred, feature disabled          | Gmail, Slack, and publisher connectors are disabled in hosted Phase 1; OAuth tables were excluded from import. Encryption/managed secret storage is mandatory before any connector is enabled in Phase 5.                                                                  |
| 7   | Provider errors leak internals       | Closed                              | API failures are logged server-side and clients receive generic messages. The summary route was corrected and a regression test proves provider detail is absent from the response.                                                                                        |
| 8   | No rate limiting                     | Closed                              | Global API throttling covers legacy routes. Login and capture credentials use repository-backed windows appropriate to serverless execution. AI and connector endpoints have tighter policies.                                                                             |
| 9   | Unbounded request fields             | Closed for release paths            | The versioned capture schema bounds URLs, titles, notes, topics, and priorities. Feedback reasons are capped at 1,000 characters; chat messages at 20,000 and conversation identifiers at 128.                                                                             |
| 10  | No CSRF protection                   | Closed                              | Session-authenticated unsafe methods require an exact allowed Origin. Capture tokens are bearer credentials used by non-cookie clients and do not rely on ambient browser authority.                                                                                       |
| 11  | Unbounded chat storage               | Risk reduced; lifecycle deferred    | Per-request size bounds and API rate limits prevent single-request storage abuse. Total conversation retention/quotas remain Phase 2 product-lifecycle work for this single-user deployment.                                                                               |
| 12  | Missing security headers             | Closed                              | CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, and strict referrer policy are applied globally.                                                                                                                                                        |
| 13  | Feedback reason not validated        | Closed                              | Type and 1,000-character bounds are enforced before database access and covered by security tests.                                                                                                                                                                         |
| 14  | Slack token format not validated     | Deferred, feature disabled          | Hosted connectors are blocked. Slack currently uses user OAuth tokens, so a bot-only `xoxb-` check would be incorrect. Revalidate token/scopes through Slack before Phase 5 enablement.                                                                                    |
| 15  | Hardcoded user agent                 | Accepted Low                        | A bounded descriptive user agent is operational metadata, not a release security issue. Network safety is enforced independently.                                                                                                                                          |
| 16  | Sort enum checked only by TypeScript | Accepted Low                        | Repository selection is parameterized and invalid values fall back to the safe recent-order branch; there is no SQL interpolation. Runtime schema consolidation remains cleanup.                                                                                           |
| 17  | URLs in verbose logs                 | Accepted Low for Phase 1            | Logs are authenticated/operator-only and contain no credentials. Connector logging remains disabled in hosted Phase 1; privacy-oriented URL redaction should precede broader connector use.                                                                                |

## Additional release hardening

- Hosted connector routes return `404` when `FEATURE_CONNECTORS=false`; sync timers are disabled.
- The source SQLite database is preserved, and transient OAuth/queue state is not imported.
- Security-sensitive capture processing is durable, idempotent, retry-bounded, and covered by
  adversarial unit/contract tests.
- Turbopack is told not to trace dynamic local publisher-session lock paths into the hosted server
  bundle. Local publisher automation remains unavailable when connectors are disabled.
- The browser extension stores its own revocable token and uses the versioned capture API; the
  iPhone Shortcut will receive a different token in Task 5.

## Verification required for completion

The release commit must pass formatting/lint, TypeScript, deterministic tests, PostgreSQL
integration, changed-line coverage, security tests, desktop/mobile E2E, extension E2E, production
build, and the aggregate GitHub Actions quality gate. Record the accepted commit and Actions run in
`docs/project-state.md`.
