---
topic: account-export
title: Account export — the reauthentication link never refreshed the session, so "Retry action" kept failing
date: 2026-10-03
time: "05:10"
status: in-progress
branch: claude/fix-reauth-magic-link
---

## What changed

**Report.** On Production on 2026-10-03 Amit clicked "Request export" on the Account page and saw
"Recent authentication is required for this account action". He clicked "Email verification
link", opened the emailed link, and "Retry action" showed the same notice again.

**Cause.** `POST /api/v1/account/export` requires a provider session created within the last ten
minutes (`requireLifecycleRoute(request, { fresh: true })`; freshness is `session.createdAt` from
an uncached provider read). Only a *new* provider session satisfies it. The reauthentication
request (`src/lib/auth/reauthentication.ts`) asked the provider for a magic link whose callback was
the page `/account?reauthenticated=1`. The hosted verify step lands on that callback with a
one-time `neon_auth_session_verifier` query parameter; a session cookie is minted only when the
SDK middleware exchanges it, and the middleware does that only on a request that also carries the
`__Secure-neon-auth.session_challenge` cookie. The sign-in and invitation flows satisfy both by
landing on `/api/auth/sign-in/complete` (which runs `auth.middleware`) and by setting the challenge
cookie when the link is requested. The reauthentication flow landed on a page (`src/proxy.ts` only
verifies sessions) and set no challenge cookie, so the browser kept its old session, `createdAt`
never changed, and every retry was refused. Nothing in the test suite exercised "link opened,
then retry succeeds".

**Fix** (branch `claude/fix-reauth-magic-link`, from `origin/main` `c010705`). The
reauthentication request now mirrors the returning sign-in flow instead of adding a new route:

- `src/lib/auth/reauthentication.ts` uses the same `MagicLinkProvider` as sign-in, points the
  callback at `/api/auth/sign-in/complete`, seals `/account?reauthenticated=1` into the existing
  `__Host-distil_pending_sign_in_next` cookie, and attaches the session-challenge cookie through
  the now exported `attachMagicLinkCookies`. `newUserCallbackURL` stays `/access-denied`.
- `src/lib/auth/sign-in-next.ts` can bind a sealed return path to a provider subject;
  `createReturningMagicLinkCompletionHandler` (`src/lib/auth/magic-link.ts`) passes the subject of
  the newly minted session. A reauthentication link opened in a browser that meanwhile signed in
  as a different identity is therefore an ordinary sign-in as the link's identity that lands on
  `/`, without the "verified" landing. Unbound sign-in paths are unchanged.
- `src/lib/auth/neon-route.ts` no longer allows `/account` as a magic-link `callbackURL`; only the
  two completion routes may receive the verifier.
- `src/components/account/account-center.tsx` reads `?reauthenticated=1` once on mount, shows
  "You're verified for the next 10 minutes. Retry the action…" at the top of both the active and
  the deletion-pending views, and removes the marker from the address bar.
- `docs/authorization-matrix.json` notes for `/api/auth/reauthenticate` and
  `/api/auth/sign-in/complete` describe the new path. No route was added; the inventory count is
  unchanged.

## Verification

Locally verified on this branch: `npm run check` (lint, typecheck, Jest), `npm run build`,
`npm run test:phase3-isolation`, `npm run audit:phase3-security`, and `npm run test:integration`
against the local Docker PostgreSQL. New or changed tests:
`src/lib/auth/__tests__/reauthentication.security.unit.test.ts` (callback target, challenge cookie,
sealed and subject-bound return path, no cookies on failure),
`src/lib/auth/__tests__/magic-link-next.security.unit.test.ts` (completion redirects the bound
subject to `/account?reauthenticated=1`; a different subject goes to `/`),
`src/lib/auth/__tests__/sign-in-next.security.unit.test.ts` (subject binding),
`src/lib/auth/__tests__/neon-route.unit.test.ts` (page callback refused),
`src/components/account/__tests__/account-center.component.test.tsx` (verified landing).

Not verified: the hosted provider's verifier exchange on a request that still carries an older
session cookie. The SDK code path is the one the returning sign-in uses in Production, and the
exchange response replaces the session cookie, but nobody has yet run the full "Request export →
link → retry → export ready" sequence on `distilai.app`. A Playwright end-to-end test is not
feasible without hosted auth and an inbox.

## External resources

None.

## Next

1. Amit: review and merge the pull request when CI is green. The merge is a Production release and
   needs his authorization.
2. Amit, after the deploy, signed in on `distilai.app`: open Account, click "Request export"; if
   the fresh-authentication notice appears, click "Email verification link", open the link in the
   same browser, confirm the Account page shows "You're verified for the next 10 minutes", click
   "Request export" again and confirm one new export row appears. Export completion itself still
   depends on the object-store variables from the 2026-10-02 `account-export` entry.
3. If the retry still fails after the link, record the exact notice and the `created_at` of the
   current session (Account → Sessions) in a new entry; the next suspect is the provider honouring
   the existing session cookie over the verifier, which would need the old session revoked before
   the exchange.
