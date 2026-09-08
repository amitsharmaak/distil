import { randomUUID } from "node:crypto";

import {
  createAuthContext,
  parseAuthContext,
  type AuthContext,
} from "@/lib/contracts/tenant-context";
import {
  createTenantJobEnvelopeV1,
  parseTenantJobEnvelopeV1,
  type TenantJobEnvelopeV1,
} from "@/lib/contracts/tenant-jobs";
import type { JobQueueRecord, RepositorySet } from "@/lib/repositories/ports";
import type { TenantJobDispatcher } from "@/lib/queue/dispatchers";

export const TENANT_JOB_ACTOR_ID = "00000000-0000-4000-8000-000000000003";

export type TenantJobHandler = (
  context: AuthContext,
  payload: Record<string, unknown>,
  repositories: RepositorySet
) => Promise<void>;

export interface TenantJobRuntimeDependencies {
  getTenantRepositories(context: AuthContext): Promise<RepositorySet>;
  handlers: ReadonlyMap<string, TenantJobHandler>;
  workerId?: string;
}

export async function throwIfTenantJobCancelled(
  repositories: RepositorySet,
  jobId: string
): Promise<void> {
  if (await repositories.jobs.isCancellationRequested(jobId)) {
    throw new Error("Job cancellation requested");
  }
}

async function auditRejected(repositories: RepositorySet, traceId: string): Promise<void> {
  await repositories.agent.insertAuditLog({
    id: randomUUID(),
    action: "tenant_job_owner_mismatch_or_missing",
    traceId,
  });
}

function ownsEnvelope(job: JobQueueRecord, envelope: TenantJobEnvelopeV1): boolean {
  return (
    job.user_id === envelope.userId &&
    job.id === envelope.jobId &&
    job.job_type === envelope.jobType
  );
}

/**
 * Consumes one untrusted envelope. The tenant-scoped claim is independently
 * checked against explicit job columns before any handler sees its payload.
 */
export async function consumeTenantJobEnvelope(
  untrustedEnvelope: unknown,
  dependencies: TenantJobRuntimeDependencies
): Promise<"completed" | "failed" | "rejected" | "unsupported"> {
  const envelope = parseTenantJobEnvelopeV1(untrustedEnvelope);
  const context = createAuthContext({
    userId: envelope.userId,
    actorKind: "system",
    actorId: TENANT_JOB_ACTOR_ID,
    requestId: envelope.traceId,
  });
  const repositories = await dependencies.getTenantRepositories(context);
  const job = await repositories.jobs.claim?.(
    envelope.jobId,
    dependencies.workerId ?? "tenant-worker"
  );
  if (!job || !ownsEnvelope(job, envelope)) {
    await auditRejected(repositories, envelope.traceId);
    return "rejected";
  }
  if (await repositories.jobs.isCancellationRequested(job.id)) {
    await repositories.jobs.complete(job.id);
    return "completed";
  }

  const handler = dependencies.handlers.get(job.job_type);
  if (!handler) {
    await repositories.jobs.complete(job.id, "No tenant handler registered");
    return "unsupported";
  }
  try {
    await handler(context, job.payload, repositories);
    await repositories.jobs.complete(job.id);
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tenant job failed";
    await repositories.jobs.complete(job.id, message);
    return "failed";
  }
}

export async function enqueueTenantJob(
  context: AuthContext,
  repositories: RepositorySet,
  input: {
    jobId: string;
    jobType: string;
    traceId?: string;
    idempotencyKey: string;
    payload?: Record<string, unknown>;
    priority?: number;
    maxRetries?: number;
    runAfter?: string;
    dispatcher?: TenantJobDispatcher;
  }
): Promise<TenantJobEnvelopeV1> {
  const trusted = parseAuthContext(context);
  const delaySeconds = queueDelaySeconds(input.runAfter);
  const envelope = createTenantJobEnvelopeV1({
    userId: trusted.userId,
    jobId: input.jobId,
    jobType: input.jobType,
    traceId: input.traceId ?? trusted.requestId,
  });
  await repositories.jobs.enqueue({
    userId: trusted.userId,
    id: envelope.jobId,
    jobType: envelope.jobType,
    idempotencyKey: input.idempotencyKey,
    payload: JSON.stringify(input.payload ?? {}),
    priority: input.priority,
    maxRetries: input.maxRetries,
    runAfter: input.runAfter,
  });
  await input.dispatcher?.dispatch(envelope, {
    idempotencyKey: input.idempotencyKey,
    ...(delaySeconds === undefined ? {} : { delaySeconds }),
  });
  return envelope;
}

/** Converts the durable queue's scheduled time into the queue transport delay. */
function queueDelaySeconds(runAfter?: string): number | undefined {
  if (!runAfter) return undefined;
  const runAfterMs = Date.parse(runAfter);
  if (Number.isNaN(runAfterMs)) throw new Error("Invalid tenant job runAfter timestamp");
  return Math.max(0, Math.ceil((runAfterMs - Date.now()) / 1_000));
}
