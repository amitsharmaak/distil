# Tenant context contracts

These production-neutral contracts establish Phase 3 trust-boundary shapes without changing any
route, repository, database, or queue behavior.

## Interfaces

- `AuthContext` is tenant-scoped and always contains UUID `tenantId`, `userId`, `actorId`, and
  `requestId` values. `actorKind` is `user`, `capture-token`, or `system`. A `user` actor must have
  `actorId === userId`; a system actor in this shape is explicitly acting on behalf of that tenant
  and user.
- `SystemContext` contains only `actorKind: "system"`, `actorId`, and `requestId`. It is for
  control-plane work and cannot be passed where tenant authorization is required.
- `CaptureQueueMessageV2` adds a validated `AuthContext` to a UUID capture identifier. It is
  additive: the existing v1 queue contract and consumers are unchanged.
- `TenantJobEnvelopeV1<TPayload>` carries a UUID job identifier, a bounded lowercase job type,
  tenant-scoped authorization, and a job-specific payload.

## Integration rules

Parse untrusted values at every HTTP, queue, scheduler, and worker boundary. Use `createAuthContext`
at the authenticated edge, then pass that validated context to `createCaptureQueueMessageV2` or
`createTenantJobEnvelopeV1`. Never reconstruct tenant identity from payload data.

`tenantJobEnvelopeV1Schema(payloadSchema)` and its parse/create helpers require the owning job's
payload schema. Object payload schemas should use `.strict().readonly()` so unknown fields are
rejected and the validated payload is frozen. All contract-owned objects are strict and frozen;
missing fields, extra fields, malformed UUIDs, and mismatched user actors fail parsing.

`SystemContext` is intentionally not convertible to `AuthContext`. A control-plane operation that
needs tenant data must separately resolve and validate the target tenant and user, then create a
new tenant-scoped `AuthContext`.
