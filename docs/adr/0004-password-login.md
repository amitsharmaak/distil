# ADR 0004: Email/password sign-in for invited accounts

**Status:** Implemented behind the existing `FEATURE_NEON_AUTH` flag

**Date:** 2026-09-11

## Context

Phase 3 (ADR 0003) shipped magic-link-only authentication for invited accounts. Amit wants a
password option for returning users who do not want to wait on an email round trip each time.
There is no 2FA yet, so a password adds a second single-factor path rather than strengthening the
existing one; it must not weaken the invitation-gated, no-self-signup model.

## Decision

Use the hosted Neon Auth email/password credential provider, reached only through Distil-gated
application routes, the same way the magic-link flow is gated. Distil stores no password hash of
its own; the provider remains the sole holder of credential material.

There is no local "set password" affordance: Better Auth's set-password operation is server-only,
so a user's first password is established by requesting a reset link from `/reset-password`, which
the provider emails and which lands on the same page to complete. Passwords must be at least 12
characters, enforced by Distil's request schemas and the forms before the provider is called.
`POST /api/auth/sign-in/password` applies per-IP and per-account rate limits and
`POST /api/auth/password/request-reset` a per-IP limit before any provider dispatch; both return
generic responses for unknown or inactive emails to preserve anti-enumeration. `POST /api/auth/password/change` requires an active session, verifies the
current password through the provider, and revokes the caller's other sessions afterward.

## Consequences

The Neon Auth project must have the email/password provider enabled for sign-in and reset to work;
this is an operational activation step, not a code change. The application's `[...path]` catch-all
proxy is unchanged and still exposes only `get-session`, `magic-link/verify` and `sign-out`; the
password operations reach the provider only through the dedicated Distil routes, which call the
SDK handler internally, and nothing forwards to the provider's `sign-up/email` endpoint, so
self-service account creation stays blocked exactly as it does for magic links. Anti-enumeration behavior, invitation gating, and per-account tenancy are
unchanged; password is an additional credential on an existing invited identity, not a new
account-creation path.
