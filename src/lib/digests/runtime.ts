import { createHash } from "node:crypto";
import { z } from "zod";

import type { JobQueueRepository } from "@/lib/repositories/ports";

import { runDigest } from "./service";
import type { DigestJob, DigestStore } from "./types";

export const DIGEST_QUEUE_JOB = "digest_run";

const payloadSchema = z
  .object({
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .strict();

const stableQueueId = (localDate: string) =>
  `dgj_${createHash("sha256").update(localDate).digest("hex").slice(0, 39)}`;

/** Mirrors the digest ledger entry into the existing durable PostgreSQL job queue. */
export async function enqueueDigestRuntimeJob(
  jobs: JobQueueRepository,
  job: DigestJob
): Promise<void> {
  await jobs.enqueue({
    id: stableQueueId(job.localDate),
    jobType: DIGEST_QUEUE_JOB,
    payload: JSON.stringify({ localDate: job.localDate, idempotencyKey: job.idempotencyKey }),
    priority: 2,
    maxRetries: 3,
  });
}

/** Adapter for the existing durable job worker; it contains no provider calls. */
export function createDigestJobHandler(store: DigestStore) {
  return async (payload: Record<string, unknown>): Promise<void> => {
    const input = payloadSchema.parse(payload);
    // A user can opt out after the cron has enqueued the durable job. Treat
    // that as a successful no-op instead of retrying a now-undesired digest.
    if (!(await store.getPreferences()).digestEnabled) return;
    await runDigest(store, input);
  };
}
