import { createHash } from "node:crypto";
import { z } from "zod";
import {
  parseAuthContext,
  requestIdSchema,
  userIdSchema,
  type AuthContext,
} from "@/lib/contracts/tenant-context";

import type { JobQueueRepository } from "@/lib/repositories/ports";

import { runDigest } from "./service";
import type { DigestJob, DigestStore } from "./types";

export const DIGEST_QUEUE_JOB = "digest_run";

const payloadSchema = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    idempotencyKey: z.string().trim().min(1).max(128),
    userId: userIdSchema,
    traceId: requestIdSchema,
  })
  .strict();

const stableQueueId = (userId: string, localDate: string) =>
  `dgj_${createHash("sha256").update(`${userId}:${localDate}`).digest("hex").slice(0, 39)}`;

/** Mirrors the digest ledger entry into the existing durable PostgreSQL job queue. */
export async function enqueueDigestRuntimeJob(
  context: AuthContext,
  jobs: JobQueueRepository,
  job: DigestJob
): Promise<void> {
  const tenant = parseAuthContext(context);
  await jobs.enqueue({
    id: stableQueueId(tenant.userId, job.localDate),
    jobType: DIGEST_QUEUE_JOB,
    payload: JSON.stringify({
      userId: tenant.userId,
      traceId: tenant.requestId,
      localDate: job.localDate,
      idempotencyKey: job.idempotencyKey,
    }),
    priority: 2,
    maxRetries: 3,
  });
}

/** Adapter for the existing durable job worker; it contains no provider calls. */
export function createDigestJobHandler(context: AuthContext, store: DigestStore) {
  const tenant = parseAuthContext(context);
  return async (payload: Record<string, unknown>): Promise<void> => {
    const input = payloadSchema.parse(payload);
    if (input.userId !== tenant.userId) throw new Error("Digest job tenant mismatch");
    // A user can opt out after the cron has enqueued the durable job. Treat
    // that as a successful no-op instead of retrying a now-undesired digest.
    if (!(await store.getPreferences()).digestEnabled) return;
    await runDigest(tenant, store, input);
  };
}
