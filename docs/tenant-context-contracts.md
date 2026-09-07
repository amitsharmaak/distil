# Tenant context contracts

These production-neutral contracts establish Phase 3 trust-boundary shapes without changing any
route, repository, database, or queue behavior. In the personal-user model, `userId` is the tenant
identity; there is no separate tenant field.

## Locked interfaces

- `AuthContext`: `{ userId, actorKind, actorId, sessionId?, requestId }`, where `actorKind` is
  `user`, `capture-token`, or `system`. All IDs are UUIDs; a user actor must have
  `actorId === userId`.
- `SystemContext`: `{ actorKind: "system", actorId, requestId }`. This user-free shape is for
  control-plane work and cannot authorize user data access.
- `CaptureQueueMessageV2`: `{ version: 2, userId, captureId, traceId }`.
- `TenantJobEnvelopeV1`: `{ version: 1, userId, jobId, jobType, traceId }`.

The queue contracts deliberately do not embed `AuthContext`. The base job envelope deliberately
does not include a payload; a future job-specific extension must preserve these top-level fields
and validate its own payload separately.

## Integration rules

Parse untrusted values at every HTTP, queue, scheduler, and worker boundary. Use the exported
constructors so `userId` cannot be omitted. Never reconstruct user identity from payload data.

All public schemas are strict and readonly: missing fields, unknown fields, malformed UUIDs,
invalid job types, and mismatched user actors fail parsing. A control-plane operation that needs
user data must separately resolve that user and create a new `AuthContext`.
