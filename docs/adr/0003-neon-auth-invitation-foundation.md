# ADR 0003: Neon Auth with app-enforced invitations

**Status:** Implemented behind feature flag; feature disabled by default

**Date:** 2026-09-07

## Decision

Phase 3 will use Neon Auth for authentication only, beginning with email magic links. Distil,
not the authentication provider, will remain the authority for whether an authenticated identity
may enter its personal account. Phase 3 is strictly personal `user_id` tenancy: every application
request that reads or mutates personal data must resolve an active internal account and scope data
to that account's internal user ID. A valid Neon Auth session alone is not authorization.

Workspaces, workspace membership, end-user roles, shared tenancy, and workspace-owner invitation
flows are Phase 6 concerns and must not be introduced by this integration.

This is deliberately an integration, not an activation. `FEATURE_NEON_AUTH` is false unless it is
exactly `true`. The pinned Neon adapter, invitation-only magic-link route, identity resolver,
session/device helpers, and composed proxy remain dormant while the flag is off. The existing
single-user session remains a bounded feature-off rollback bridge.

## Evidence and SDK decision

Validation performed on 2026-09-07 and dependency disposition revalidated on 2026-09-08:

| Item                   | Result                                                          |
| ---------------------- | --------------------------------------------------------------- |
| Distil                 | Next.js `16.3.4`, React `19.2.3`, Node `22.23.2`                |
| Current SDK            | `@neondatabase/auth@0.5.0-beta` from the npm `latest` tag       |
| Peer range             | `next >=16.0.0`, `react >=18.0.0`, `react-dom >=18.0.0`         |
| Recommended server API | `createNeonAuth` from `@neondatabase/auth/next/server`          |
| Next adapter API       | `auth.handler()`, `auth.middleware()`, and `auth.getSession()`  |
| Magic-link capability  | Declares `signIn.magicLink` and `/magic-link/verify` endpoints  |
| Production audit       | Reviewed: 6 moderate build-tool findings; no deployed path      |
| Dependency graph       | Pass: official non-UI adapters plus a fail-closed local UI stub |
| License review         | Pass: no AGPL package remains in the production lock graph      |

The SDK is compatible with the repository's Next 16 version by declared peer dependency and its
own development dependency uses Next `16.2.11`. It remains beta, so the Phase 3 implementation
must pin an exact vetted version rather than a caret range and include an upgrade review. The
validated SDK API is the post-v0.2 unified API; do not implement examples using the superseded
`neonAuth`, `authApiHandler`, or `neonAuthMiddleware` entry points.

Pinning exposed release blockers that must not be waived merely because the selected server
subpath compiles. The package installs `@neondatabase/auth-ui` even though Distil does not import
it; the published UI graph contains an invalid Better Auth peer and pulls AGPL-licensed
`@triplit/client` and `ua-parser-js`. The upstream package README now documents the UI as a
separate install, but the published `0.5.0-beta` package metadata still declares it as mandatory.

Distil therefore replaces only that unused dependency with the checked-in
`vendor/neon-auth-ui-disabled` package. It throws if a legacy UI export is ever imported. The
official `@neondatabase/auth/next` and `@neondatabase/auth/next/server` code remains pinned and is
covered by compile and adapter tests; the invitation-only custom UI and magic-link sign-in path do
not use the replaced package. The committed offline policy verifies that the peer conflict and AGPL
packages are absent. This is a narrow isolation, not a license allowlist and not a fork of the auth
runtime. Remove it when a vetted official release makes Auth UI separately installable.

`npm audit --omit=dev` still reports six moderate findings through `drizzle-kit` and its old
`esbuild` dependency, including the SDK's pinned `better-auth@1.6.23`. The underlying published
advisory applies when the esbuild development server is running. Distil does not invoke
`drizzle-kit`, esbuild's serve API, or any Better Auth schema-generation tool in its deployed
runtime; Next compiles the reviewed adapter entry points into the application build. The finding is
therefore accepted as non-exploitable in the deployed path, while dependency updates remain normal
upgrade work. Upgrading Better Auth independently would override the SDK's exact runtime contract
and is less safe than retaining the supported pin. The pin remains an integration target, not
blanket approval for SDK UI or tooling exports.

The eventual server configuration is conceptually:

```ts
createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
```

The Next client adapter in this package uses the same-origin `/api/auth` proxy and takes no URL
argument. Do not add a `NEXT_PUBLIC_NEON_AUTH_URL` merely by habit; that would create an
unnecessary public configuration contract. Revalidate the exact package behavior when pinning.

Sources: [Neon Auth v0.2 migration guide](https://neon.com/docs/auth/migrate/from-auth-v0.1),
[Neon Auth SDK changelog](https://neon.com/docs/changelog/2026-01-30), and
[@neondatabase/auth on npm](https://www.npmjs.com/package/@neondatabase/auth). Dependency
disposition sources: [official Neon SDK auth README](https://github.com/neondatabase/neon-js/tree/main/packages/auth)
and [esbuild advisory GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).

## Authentication and authorization contract

1. Only the magic-link plugin is enabled for the first user-facing flow. Password, OTP, social,
   passkey, organization-management, and self-service signup UI are out of scope.
2. An invite is issued only by an audited, operator-only command/control-plane API; it is not an
   end-user or account-owner capability. Store the invite token only as a salted, one-way hash;
   bind it to a normalized email, expiry, operator issuer, issuance reason, and one-time
   consumption timestamp. The raw token appears only in the email link.
3. The invite landing page checks the token before requesting a magic link. It allows only a
   callback URL from the exact application origin allowlist and keeps the intended destination in
   server state, not a user-controlled redirect parameter.
4. On a verified Neon Auth session, an idempotent server transaction consumes the matching active
   invite, creates or reactivates the internal `users` account with active status, and creates the
   identity mapping. It must compare the verified email with the invite email using the product's
   canonical normalization rule.
5. Authorization resolves `provider` plus `provider_subject` through `auth_identities` to
   `users.id` and verifies active account status on every protected request. All product queries
   are scoped to that `users.id` as `user_id`. A verified identity with no mapped active user is
   denied exactly like a pending, expired, revoked, wrong-email, or already-consumed invite.
   Return a generic "unable to continue" response to avoid invite/account enumeration.
6. Neon Auth organizations and invitations are not used for Phase 3 product authorization or
   tenancy. They may be evaluated only when Phase 6 collaboration is explicitly in scope; until
   then, Distil's operator-issued invitation and active-account records remain independently
   enforceable and auditable.

There is one important feasibility limitation: the validated magic-link endpoint accepts an email
and may create an identity. App-side enforcement can guarantee that an uninvited identity receives
no Distil data, but it cannot by itself guarantee that no provider identity is created through a
generic auth endpoint. Before enabling, verify in the Neon console and pinned SDK whether
self-registration can be disabled for magic links. If it cannot, either accept harmless orphaned
identities with no active internal account or put link issuance behind an invite-validating server route and
ensure the generic endpoint is not publicly usable. This is an enablement gate, not an assumption.

## Internal identity mapping

Phase 3 will add an application-owned `users` row with a generated internal UUID and a normalized
email snapshot for display and invite matching. `users` must not store a Neon subject, provider
subject, or other external identity as a direct ownership key. The mapping is an application-owned
`auth_identities(provider, provider_subject, user_id)` table: `(provider, provider_subject)` is
unique and `user_id` references `users.id`. Personal-data foreign keys, `user_id` scoping, audit
records, and capture ownership reference the internal UUID only. Do not assume a provider subject
is a UUID, reuse it as a primary key, or put business attributes in provider tables.

The mapping is created only after a verified email and successful invite consumption, and is
idempotent on `(provider, provider_subject)`. An existing mapping can authenticate only while its
user is active; an uninvited identity has no mapping to an active user and is denied. Email changes
require a verified provider email and an explicit conflict policy; they never merge two internal
users automatically. This personal-account model has no collaboration layer: there are no
workspace, membership, or workspace ownership tables or predicates. The concrete repository
adapters are part of the Phase 3 migration workstream.

## Session and device contract

Neon Auth's current Next server SDK signs a session-data cache cookie with
`NEON_AUTH_COOKIE_SECRET`; its documented default cache TTL is five minutes. Configure a secret
of at least 32 characters, HTTPS-only cookies, host-only cookie domain unless a deliberate
subdomain design is approved, and `SameSite=Lax` unless a future cross-site flow requires a
different reviewed policy.

The cache is an identity optimization, not authorization caching. Active-account status and invite
state are checked application-side on each protected request, so a disabled account loses Distil
access immediately even if a provider session is still cached. Provide device/session listing and
individual/all-session revocation through the provider's session APIs, and revoke active provider
sessions when an account is disabled or a high-risk account change occurs. Keep the legacy
`DISTIL_SESSION_SECRET` path until the migration has a rollback plan; do not mix its cookie with
Neon Auth's cookie names.

For an authenticated but stale session, `POST /api/auth/reauthenticate` resolves the mapped active
account, selects its provider-verified email server-side, and invokes the official
`signIn.magicLink` method. The email callback is fixed to the same-origin `/account` page; the
provider's magic-link verification creates the new authentication session whose `createdAt` drives
the existing ten-minute freshness check. Callers cannot choose the email or callback, and an
unmapped, disabled, or unauthenticated identity cannot dispatch a link. This is a real provider
ceremony, not session refresh relabeled as fresh authentication.

## Proxy, route, and webhook boundaries

The existing `src/proxy.ts` owns CORS, rate limits, legacy session checks, capture-token paths,
and connector shutdown. The SDK's `auth.middleware()` cannot be exported independently beside it.
The implementation must introduce one consciously composed Next 16 proxy, preserve the existing
specialized routes, and test response/cookie/header precedence. It must expose the SDK handler
only at a new dedicated `/api/auth/[...path]` route after the invite-only gate is satisfied.

The inspected 0.5.0-beta SDK exports no webhook receiver or webhook configuration. Neon Auth's
current branchable model stores auth data in the database, so no profile-sync webhook is required
for the selected design. Do not invent a webhook endpoint. If a later email provider or lifecycle
integration needs one, it gets a dedicated route with all of the following: raw-body verification
before parsing, provider-specified signature verification using a secret server variable,
constant-time comparison, timestamp/replay-window validation, idempotency keys retained in the
application database, strict event allowlisting, a small body limit, and no logged payload or
secret. A webhook must never activate an account; it may only trigger a re-read of the
authoritative session and account status.

## Preview environment and email contract

Each Vercel Preview maps to its own Neon database branch and therefore its own Neon Auth endpoint.
Do not point Preview at Production Auth or share cookie-signing secrets across environments.

| Variable                   | Preview value                                      | Handling                                                                     |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `FEATURE_NEON_AUTH`        | `false` until the gates below pass                 | Server-only release flag; exact `true` enables the future path               |
| `NEON_AUTH_BASE_URL`       | That Preview branch's Auth URL                     | Server-only; never expose through a `NEXT_PUBLIC_` variable                  |
| `NEON_AUTH_COOKIE_SECRET`  | Unique random secret, at least 32 characters       | Server-only; stable for that environment while sessions must survive deploys |
| `NEON_AUTH_WEBHOOK_SECRET` | Absent unless a separately reviewed webhook exists | Server-only; no route means no value is needed                               |
| `DISTIL_LEGACY_USER_ID`    | Migrated first account's internal UUID             | Server-only; required only while tenant-aware routes use the legacy bridge   |

The current SDK does not need a public Auth URL when using its Next adapter. App callback and
redirect origins must be exact HTTPS Preview origins configured in the provider, never a wildcard
Vercel domain. Keep `DATABASE_URL`, `DATABASE_MIGRATION_URL`, existing session secrets, and auth
variables separate per the established deployment contract.

Use Neon's shared development email service only for disposable Preview testing. Before a
production enablement, configure a product-owned sending domain and provider in Neon Auth, verify
SPF/DKIM/DMARC, sender identity, reply handling, rate/abuse limits, and branded but non-sensitive
magic-link/invite templates. Magic links and invite URLs must be short-lived, single-use where
supported, and must not be included in logs, analytics, referrers, or support tickets.

## Failure modes and product behavior

| Failure                                       | Safe behavior                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature disabled or config missing            | Keep current single-user auth unchanged; fail closed if an accidentally exposed Neon route is reached                                       |
| Auth endpoint/network outage                  | No new login; existing authorized application requests follow a deliberately tested, short failure policy and never become anonymous access |
| Expired/used/revoked invite                   | Generic failure, no account disclosure; an audited operator can issue a replacement                                                         |
| Verified identity without active account      | Authenticated but denied from all personal data; show an access-request/help state                                                          |
| Wrong email or changed email                  | Do not consume the invite; require a matching verified email or operator-issued replacement                                                 |
| Replay, redirect tampering, or webhook replay | Reject; consume links atomically and enforce exact redirect origins/signature/replay checks                                                 |
| Account disabled                              | Deny next protected request; revoke provider sessions for disable/high-risk cases                                                           |
| Preview/production mix-up                     | Reject deployment readiness; endpoint, cookie secret, origins, database branch, and email sender must be environment-specific               |

## Enablement gates and test strategy

Before moving `FEATURE_NEON_AUTH` to true, complete all of these:

1. Maintain the reviewed pinned SDK graph: the unused UI replacement must fail closed, the offline
   dependency policy must remain free of invalid peers and AGPL packages, and the official adapter
   entry points must compile/build against the deployed Next 16 version. Re-run the API, advisory,
   and runtime-reachability review on every SDK upgrade because the package is beta.
2. Prove magic-link-only configuration and resolve the self-registration limitation above in a
   disposable Preview branch with no real user data.
3. Add unit tests for disabled/misconfigured flags, invite hashing/expiry/atomic consumption,
   email normalization, `auth_identities(provider, provider_subject, user_id)` mapping,
   active-account checks, generic errors, and redirect validation.
4. Add route/proxy contract tests for unauthenticated, pending-invite, active-account, disabled,
   and capture-token requests; assert legacy session behavior during the migration.
5. Add browser tests covering request link, valid invite acceptance, wrong account, expired/reused
   link, sign out, a second device, session revocation, and direct access to every personal-data route.
6. Exercise real Preview email delivery and callback origins with test inboxes. Test auth outage,
   provider timeout, database transaction retry, and a deploy with stable cookie secret.
7. If a webhook is introduced, add adversarial signature, stale timestamp, duplicate delivery,
   oversized body, and unrecognized-event tests. No live webhook is a prerequisite for this design.
8. Complete a security review of the composed proxy, cookie attributes, logs, email templates,
   invite audit trail, Vercel/Neon branch isolation, and rollback to the legacy session path.

## Consequences

Neon Auth is technically viable for Distil's current Next.js 16 stack and supports the desired
magic-link primitive. The unaddressed decision is not SDK compatibility; it is the product policy
for provider identities created before an active internal account exists. The app-side authorization boundary makes
that safe for personal data, but a strict no-orphan-identity requirement needs an explicit provider
configuration validation before activation.
