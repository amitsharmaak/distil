# ADR 0003: Neon Auth with app-enforced invitations

**Status:** Proposed; feature disabled

**Date:** 2026-09-07

## Decision

Phase 3 will use Neon Auth for authentication only, beginning with email magic links. Distil,
not the authentication provider, will remain the authority for whether an authenticated identity
may enter a workspace and what it may do there. Every application request that reads or mutates
tenant data must resolve an active internal membership; a valid Neon Auth session alone is not
authorization.

This is deliberately an integration foundation, not an activation. `FEATURE_NEON_AUTH` is false
unless it is exactly `true`, no Neon package has been added, and no route, proxy, session, schema,
or current single-user behavior has changed. `readNeonAuthFoundation` only describes whether the
future server-side configuration is present and never returns a secret.

## Evidence and SDK decision

Validation performed on 2026-09-07:

| Item                   | Result                                                         |
| ---------------------- | -------------------------------------------------------------- |
| Distil                 | Next.js `16.3.4`, React `19.2.3`, Node `22.23.2`               |
| Current SDK            | `@neondatabase/auth@0.5.0-beta` from the npm `latest` tag      |
| Peer range             | `next >=16.0.0`, `react >=18.0.0`, `react-dom >=18.0.0`        |
| Recommended server API | `createNeonAuth` from `@neondatabase/auth/next/server`         |
| Next adapter API       | `auth.handler()`, `auth.middleware()`, and `auth.getSession()` |
| Magic-link capability  | Declares `signIn.magicLink` and `/magic-link/verify` endpoints |

The SDK is compatible with the repository's Next 16 version by declared peer dependency and its
own development dependency uses Next `16.2.11`. It remains beta, so the Phase 3 implementation
must pin an exact vetted version rather than a caret range and include an upgrade review. The
validated SDK API is the post-v0.2 unified API; do not implement examples using the superseded
`neonAuth`, `authApiHandler`, or `neonAuthMiddleware` entry points.

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
[@neondatabase/auth on npm](https://www.npmjs.com/package/@neondatabase/auth).

## Authentication and authorization contract

1. Only the magic-link plugin is enabled for the first user-facing flow. Password, OTP, social,
   passkey, organization-management, and self-service signup UI are out of scope.
2. An invite is created by a current workspace owner. Store the invite token only as a salted,
   one-way hash; bind it to a normalized email, workspace, role, expiry, issuer, and one-time
   consumption timestamp. The raw token appears only in the email link.
3. The invite landing page checks the token before requesting a magic link. It allows only a
   callback URL from the exact application origin allowlist and keeps the intended destination in
   server state, not a user-controlled redirect parameter.
4. On a verified Neon Auth session, an idempotent server transaction consumes the matching active
   invite and creates or reactivates an internal membership. It must compare the verified email
   with the invite email using the product's canonical normalization rule.
5. Authorization resolves `auth_user_id -> users.id -> workspace_memberships` on every protected
   request. A pending, expired, revoked, wrong-email, or already-consumed invite cannot provide
   application access. Returning a generic "unable to continue" response avoids invite/account
   enumeration.
6. Neon Auth's organizations and invitations are not the product authorization source of truth.
   They may be evaluated later as UI conveniences, but Distil's invitation, role, and tenancy
   records remain independently enforceable and auditable.

There is one important feasibility limitation: the validated magic-link endpoint accepts an email
and may create an identity. App-side enforcement can guarantee that an uninvited identity receives
no Distil data, but it cannot by itself guarantee that no provider identity is created through a
generic auth endpoint. Before enabling, verify in the Neon console and pinned SDK whether
self-registration can be disabled for magic links. If it cannot, either accept harmless orphaned
identities with no membership or put link issuance behind an invite-validating server route and
ensure the generic endpoint is not publicly usable. This is an enablement gate, not an assumption.

## Internal identity mapping

Phase 3 will add an application-owned `users` row with a generated internal UUID. It will have a
unique, immutable `neon_auth_user_id` external identifier plus a normalized email snapshot for
display and invite matching. Product foreign keys, tenant scoping, audit records, and capture
ownership reference the internal UUID only. Do not assume the provider identifier is a UUID, reuse
it as a primary key, or put business attributes in `neon_auth` tables.

The mapping is created only after a verified session and is idempotent on the external identifier.
Email changes require a verified provider email and an explicit conflict policy; they never merge
two internal users automatically. The required tables and repository ports are intentionally left
to the Phase 3 migration workstream.

## Session and device contract

Neon Auth's current Next server SDK signs a session-data cache cookie with
`NEON_AUTH_COOKIE_SECRET`; its documented default cache TTL is five minutes. Configure a secret
of at least 32 characters, HTTPS-only cookies, host-only cookie domain unless a deliberate
subdomain design is approved, and `SameSite=Lax` unless a future cross-site flow requires a
different reviewed policy.

The cache is an identity optimization, not authorization caching. Membership revocation and invite
state are checked application-side on each protected request, so a removed member loses Distil
access immediately even if a provider session is still cached. Provide device/session listing and
individual/all-session revocation through the provider's session APIs, and revoke active provider
sessions when an account is disabled or a high-risk membership change occurs. Keep the legacy
`DISTIL_SESSION_SECRET` path until the migration has a rollback plan; do not mix its cookie with
Neon Auth's cookie names.

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
secret. A webhook must never activate membership; it may only trigger a re-read of the authoritative
session and membership state.

## Preview environment and email contract

Each Vercel Preview maps to its own Neon database branch and therefore its own Neon Auth endpoint.
Do not point Preview at Production Auth or share cookie-signing secrets across environments.

| Variable                   | Preview value                                      | Handling                                                                     |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `FEATURE_NEON_AUTH`        | `false` until the gates below pass                 | Server-only release flag; exact `true` enables the future path               |
| `NEON_AUTH_BASE_URL`       | That Preview branch's Auth URL                     | Server-only; never expose through a `NEXT_PUBLIC_` variable                  |
| `NEON_AUTH_COOKIE_SECRET`  | Unique random secret, at least 32 characters       | Server-only; stable for that environment while sessions must survive deploys |
| `NEON_AUTH_WEBHOOK_SECRET` | Absent unless a separately reviewed webhook exists | Server-only; no route means no value is needed                               |

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
| Expired/used/revoked invite                   | Generic failure, no account or workspace disclosure; owner can issue a replacement                                                          |
| Verified user without membership              | Authenticated but denied from all tenant data; show an access-request/help state                                                            |
| Wrong email or changed email                  | Do not consume the invite; require a matching verified email or owner-issued replacement                                                    |
| Replay, redirect tampering, or webhook replay | Reject; consume links atomically and enforce exact redirect origins/signature/replay checks                                                 |
| Membership revoked                            | Deny next protected request; revoke provider sessions for disable/high-risk cases                                                           |
| Preview/production mix-up                     | Reject deployment readiness; endpoint, cookie secret, origins, database branch, and email sender must be environment-specific               |

## Enablement gates and test strategy

Before moving `FEATURE_NEON_AUTH` to true, complete all of these:

1. Pin the SDK version and compile/build it against the deployed Next 16 version. Re-run the API
   review because the package is beta.
2. Prove magic-link-only configuration and resolve the self-registration limitation above in a
   disposable Preview branch with no real user data.
3. Add unit tests for disabled/misconfigured flags, invite hashing/expiry/atomic consumption,
   email normalization, external-to-internal UUID mapping, role checks, generic errors, and redirect
   validation.
4. Add route/proxy contract tests for unauthenticated, pending-invite, active-member, revoked,
   and capture-token requests; assert legacy session behavior during the migration.
5. Add browser tests covering request link, valid invite acceptance, wrong account, expired/reused
   link, sign out, a second device, session revocation, and direct access to every tenant route.
6. Exercise real Preview email delivery and callback origins with test inboxes. Test auth outage,
   provider timeout, database transaction retry, and a deploy with stable cookie secret.
7. If a webhook is introduced, add adversarial signature, stale timestamp, duplicate delivery,
   oversized body, and unrecognized-event tests. No live webhook is a prerequisite for this design.
8. Complete a security review of the composed proxy, cookie attributes, logs, email templates,
   invite audit trail, Vercel/Neon branch isolation, and rollback to the legacy session path.

## Consequences

Neon Auth is technically viable for Distil's current Next.js 16 stack and supports the desired
magic-link primitive. The unaddressed decision is not SDK compatibility; it is the product policy
for provider identities created before membership exists. The app-side authorization boundary makes
that safe for tenant data, but a strict no-orphan-identity requirement needs an explicit provider
configuration validation before activation.
