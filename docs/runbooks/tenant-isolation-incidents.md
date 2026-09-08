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
