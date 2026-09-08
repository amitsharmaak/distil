# Account deletion runbook

## Request and grace period

1. Require verified fresh authentication, exact allowed Origin and the literal confirmation
   `DELETE MY ACCOUNT`.
2. In one tenant transaction set the account to `deletion_pending`, revoke capture tokens and
   session metadata, remove connector credentials/state, request cancellation of running work and
   cancel queued work. This immediately denies normal product access.
3. Enqueue one `account.deletion` job for `purge_after`, exactly seven days after the request.
4. During the grace period only the narrow, freshly authenticated `DELETE
/api/v1/account/deletion` boundary may admit `deletion_pending`; it can restore `active`. Revoked
   sessions, client tokens and connector grants are not restored.

## Final purge

1. The separately privileged worker verifies the deletion ID, tenant ID, status and elapsed grace
   period, then claims `purging`.
2. Delete every object under the tenant-derived namespace and verify a zero-object list.
3. Revoke provider sessions and delete the provider identity through the `AuthAccountPurger` seam.
   The eventual provider adapter must make both operations idempotent. No real Neon admin adapter
   is included; this is an activation blocker.
4. Delete the `users` row so relational cascades remove every tenant-owned row. Verify every table
   in `tenantProtectedTables` has zero rows for the target.
5. Insert one content-free tombstone keyed only by deletion ID, with verifier version, zero counts,
   auth-purge boolean and verification hash. Write a privileged completion audit event.
6. Redelivery exits from the tombstone without reconstructing or re-reading deleted data.

If any object, auth or relational verification fails, retain/mark the lifecycle record failed,
record only an allowlisted error code, and retry the idempotent purge stages from the durable
lifecycle record. Never declare completion or manually delete the tombstone to make verification
pass.

An independently retained immutable deletion ledger is required before production. Restoring a
database backup taken before deletion could otherwise resurrect the account and its content.
