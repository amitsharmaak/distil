# Tenant isolation, quota and suspension incident runbook

## Suspected cross-tenant exposure

1. Stop affected traffic and workers. Keep database/object evidence immutable; rotate runtime and
   queue credentials if compromise is plausible.
2. Record time, release SHA, request/trace IDs, actor and opaque tenant IDs. Never paste content,
   prompts, tokens, cookies, URLs or object keys into tickets/logs.
3. Check route authentication, same-statement owner predicate, transaction-local `app.user_id`,
   queue envelope ownership, pre-ranking/search filters, AI excerpts, quota key and object-store
   derived key.
4. Seed distinctive synthetic canaries for users A/B and reproduce in an isolated restore. Verify no
   foreign reads and no side effects on denied mutations.
5. Review affected audit data under privilege, notify privacy/security owners, and follow applicable
   breach obligations. Do not resume until the denial is proven at route, repository, RLS, worker,
   AI and object boundaries.

## Quota exhaustion

- Quotas are keyed to the internal tenant and period. Never use IP/email/global process counters as
  the account budget.
- `ai.requests` is consumed atomically before provider work. Exhaustion must yield the typed budget
  path; durable capture remains accepted and the intelligence artifact becomes degraded/retryable.
- Compare `user_quotas` with `usage_counters`; adjust only through an audited control-plane change.
  Do not silently reset or merge two tenants' counters.

## Suspension and invitation revocation

- Preview a suspension with `npm run account:lifecycle -- suspend <user-uuid> <operator-uuid>
<reason>`; add `--execute` only after verifying environment and target through the approved
  operator channel. The checked-in command refuses production mutations.
- Suspension sets `suspended`, revokes capture/session metadata, removes connector credentials/state,
  cancels tenant work and writes a privileged audit event. Provider-wide session revocation remains
  blocked until a reviewed admin adapter exists.
- Revoke a pending invitation with `npm run auth:invite -- revoke <invitation-uuid>
<operator-uuid> <reason>`. The invitation row records actor, reason and timestamp. Invitations stay
  disabled; this command does not authorize issuance or real-user onboarding.

## Shortcut pairing pre-context boundary

- Stage `phone-pairing` (`0016_phone_pairing.sql`) follows `browser-connections`. Run it with the
  owner connection before releasing code that reads the pairing table. Verify the complete schema
  with `db:tenant:verify -- --amit-user-id <uuid> --stage rehearsal --through phone-pairing
--output <report.json>`; `--through expand` remains the pre-contract gate.
- `shortcut_pairings` has forced RLS and a tenant view. Its optional token reference includes
  `user_id` on both sides. Account deletion cascades these rows; exports omit code/token hashes.
- `distil_resolve_shortcut_pairing(text)` is the only pre-context identity lookup. It accepts an
  exact code hash and returns only the pairing and tenant IDs for an active, unconsumed, unexpired
  code below its attempt cap and an active account. Check its fixed search path, migration-role
  owner, revoked `PUBLIC` execution and runtime `EXECUTE` grant if investigating access.
- `distil_consume_shortcut_pairing_rate_limit(text)` limits all exchange attempts before lookup:
  ten per hashed `pairing:${ip}` key per server-clock fifteen-minute window. Runtime has no direct
  grants on `shortcut_pairing_rate_limits`; only this bounded function can mutate it. It removes
  at most 100 expired rows per call. Never retain raw IPs, plaintext codes or tokens in evidence.
- A new code replaces the previous pending code. Suspending the account blocks resolution;
  disconnecting a phone revokes its token without rotating manual or browser credentials.
