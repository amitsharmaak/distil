# Account export runbook

## Scope and safety

The Phase 3 export is tenant-scoped, asynchronous and idempotent. The checked-in object-store
adapters are fake/local only; there is no production Vercel Blob adapter, bucket, signed URL or
provisioning in this change. Keep `FEATURE_NEON_AUTH=false` until the full Phase 3 acceptance gate.

## Request and processing

1. Require a verified active account, fresh authentication, exact allowed Origin and a unique
   `Idempotency-Key` on `POST /api/v1/account/export`.
2. Confirm the response is `202` with opaque export/job IDs. Repeating the same key must return the
   same export and must not enqueue duplicate work. A request with a new key while the account
   already has a `pending` or `running` export also returns that export (`created: false`), with no
   second quota charge and no second job; requests are serialized per account by an advisory lock.
3. The `account.export` worker revalidates `(user_id, export_id, job_id)`, checks cooperative
   cancellation, reads the allowlisted tenant snapshot, creates the v1 deterministic manifest/ZIP,
   writes through `TenantObjectStore`, and stores its SHA-256 and byte count.
4. Poll only `GET /api/v1/account/exports/:id`. Never expose the logical or physical object key.
5. Download through the authenticated proxy. It rechecks ownership, ready state, the 24-hour
   authorization window, object hash and size, and returns `private, no-store`.
6. Purge the object by `purge_after` (seven days), then mark the row expired. A purge failure keeps
   the row non-expired and alerts operations; it never turns the object public.

## Terminal states

An export never stays `pending` or `running` without a worker:

- No object storage (`DISTIL_OBJECT_STORE_PROVIDER`, `DISTIL_OBJECT_STORE_ENVIRONMENT` or
  `BLOB_READ_WRITE_TOKEN` missing in a hosted environment): the worker marks the export `failed`
  with `EXPORT_STORAGE_UNAVAILABLE`. The job still fails and is retried; a retry after storage is
  repaired reclaims the failed export and completes it.
- A generation or storage error after the claim: `failed` with `EXPORT_GENERATION_FAILED`, retried
  the same way.
- No live worker at all (the job exhausted its five deliveries, or a run was cut off): an export
  untouched for 15 minutes is marked `failed` with `EXPORT_STALLED` the next time its owner requests,
  lists or reads exports.

The API returns `failureCode` and a fixed `failureMessage`; internal error text is never sent.

## Verification and incident response

- Inspect `failureCode`, job attempts and privacy-safe audit metadata; never log ZIP bodies, source
  rows, URLs, prompts, credentials, object keys or provider errors containing content.
- Retry the same durable job only. A ready row plus matching object is a no-op.
- If hash/size differs, block download, quarantine the local object root and regenerate from a new
  export request after diagnosing storage integrity.
- Cross-tenant and unknown export IDs must return indistinguishable `404` responses.

Production activation remains blocked until a private tenant-keyed hosted adapter, lifecycle
reconciler, retention worker, backup inventory and synthetic Preview acceptance are reviewed.
