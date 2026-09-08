# Account export runbook

## Scope and safety

The Phase 3 export is tenant-scoped, asynchronous and idempotent. The checked-in object-store
adapters are fake/local only; there is no production Vercel Blob adapter, bucket, signed URL or
provisioning in this change. Keep `FEATURE_NEON_AUTH=false` until the full Phase 3 acceptance gate.

## Request and processing

1. Require a verified active account, fresh authentication, exact allowed Origin and a unique
   `Idempotency-Key` on `POST /api/v1/account/export`.
2. Confirm the response is `202` with opaque export/job IDs. Repeating the same key must return the
   same export and must not enqueue duplicate work.
3. The `account.export` worker revalidates `(user_id, export_id, job_id)`, checks cooperative
   cancellation, reads the allowlisted tenant snapshot, creates the v1 deterministic manifest/ZIP,
   writes through `TenantObjectStore`, and stores its SHA-256 and byte count.
4. Poll only `GET /api/v1/account/exports/:id`. Never expose the logical or physical object key.
5. Download through the authenticated proxy. It rechecks ownership, ready state, the 24-hour
   authorization window, object hash and size, and returns `private, no-store`.
6. Purge the object by `purge_after` (seven days), then mark the row expired. A purge failure keeps
   the row non-expired and alerts operations; it never turns the object public.

## Verification and incident response

- Inspect `failureCode`, job attempts and privacy-safe audit metadata; never log ZIP bodies, source
  rows, URLs, prompts, credentials, object keys or provider errors containing content.
- Retry the same durable job only. A ready row plus matching object is a no-op.
- If hash/size differs, block download, quarantine the local object root and regenerate from a new
  export request after diagnosing storage integrity.
- Cross-tenant and unknown export IDs must return indistinguishable `404` responses.

Production activation remains blocked until a private tenant-keyed hosted adapter, lifecycle
reconciler, retention worker, backup inventory and synthetic Preview acceptance are reviewed.
