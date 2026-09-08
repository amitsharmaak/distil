import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createAuthContext, type AuthContext, type SystemContext } from "@/lib/contracts";
import { enqueueTenantJob } from "@/lib/jobs/tenant-runtime";
import type {
  AccountDeletionRecord,
  AuthAccountPurger,
  ControlPlaneLifecycleRepository,
} from "@/lib/lifecycle/ports";
import type { RepositorySet } from "@/lib/repositories/ports";
import type { TenantObjectStore } from "@/lib/storage/object-store";

import { LifecycleError } from "./errors";

export const ACCOUNT_DELETION_JOB_TYPE = "account.deletion";
export const ACCOUNT_DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const deletionConfirmationSchema = z
  .object({ confirmation: z.literal("DELETE MY ACCOUNT") })
  .strict();

export async function requestAccountDeletion(
  context: AuthContext,
  repositories: RepositorySet,
  input: { confirmation: string; now?: Date }
): Promise<{ deletion: AccountDeletionRecord; jobId: string; created: boolean }> {
  deletionConfirmationSchema.parse({ confirmation: input.confirmation });
  const now = input.now ?? new Date();
  const result = await repositories.lifecycle.requestDeletion({
    id: randomUUID(),
    requestedAt: now.toISOString(),
    purgeAfter: new Date(now.getTime() + ACCOUNT_DELETION_GRACE_MS).toISOString(),
  });
  const jobId = result.record.id;
  if (result.created) {
    await enqueueTenantJob(context, repositories, {
      jobId,
      jobType: ACCOUNT_DELETION_JOB_TYPE,
      idempotencyKey: `account-deletion:${result.record.id}`,
      payload: { deletionId: result.record.id, jobId },
      runAfter: result.record.purgeAfter,
      maxRetries: 20,
      priority: 100,
    });
  }
  return { deletion: result.record, jobId, created: result.created };
}

export async function cancelAccountDeletion(
  context: AuthContext,
  repositories: RepositorySet,
  input: { reason?: string; now?: Date }
): Promise<AccountDeletionRecord> {
  const deletion = await repositories.lifecycle.findDeletion();
  if (!deletion) throw new LifecycleError("NOT_FOUND", 404, "Deletion request not found");
  const now = input.now ?? new Date();
  const cancelled = await repositories.lifecycle.cancelDeletion({
    deletionId: deletion.id,
    actorId: context.actorId,
    reason: input.reason?.trim() || "user_cancelled_within_grace_period",
    cancelledAt: now.toISOString(),
  });
  if (!cancelled) throw new LifecycleError("NOT_FOUND", 404, "Deletion request not found");
  await repositories.jobs.requestCancellation(
    deletion.id,
    "account_deletion_cancelled",
    now.toISOString()
  );
  return cancelled;
}

export interface AccountDeletionWorkerDependencies {
  objectStore: TenantObjectStore;
  authPurger: AuthAccountPurger;
  getControlPlaneLifecycle(context: SystemContext): Promise<ControlPlaneLifecycleRepository>;
  systemContext: SystemContext;
}

export async function processAccountDeletion(
  context: AuthContext,
  repositories: RepositorySet,
  dependencies: AccountDeletionWorkerDependencies,
  input: { deletionId: string; now?: Date }
) {
  const now = input.now ?? new Date();
  const control = await dependencies.getControlPlaneLifecycle(dependencies.systemContext);
  const priorVerification = await control.findDeletionVerification(input.deletionId);
  if (priorVerification) {
    return { status: "completed" as const, verification: priorVerification };
  }
  const record = await control.findDeletionWork(input.deletionId, context.userId);
  if (!record) throw new LifecycleError("NOT_FOUND", 404, "Deletion request not found");
  if (record.status === "cancelled") return { status: "cancelled" as const };
  if (new Date(record.purgeAfter).getTime() > now.getTime()) {
    throw new Error("Deletion grace period has not elapsed");
  }
  if (!(await control.markDeletionPurging(record.id, context.userId, now.toISOString()))) {
    throw new Error("Deletion is not claimable");
  }
  try {
    const purgeContext = createAuthContext({
      userId: context.userId,
      actorKind: "system",
      actorId: dependencies.systemContext.actorId,
      requestId: dependencies.systemContext.requestId,
    });
    const objects = await dependencies.objectStore.list(purgeContext, { limit: 1_000 });
    for (const object of objects) await dependencies.objectStore.delete(purgeContext, object.ref);
    const remaining = await dependencies.objectStore.list(purgeContext, { limit: 1 });
    if (remaining.length > 0) throw new Error("Tenant objects remain after purge");
    await dependencies.authPurger.revokeSessions(context.userId);
    await dependencies.authPurger.deleteIdentity(context.userId);
    const verification = await control.completeDeletion({
      deletionId: record.id,
      userId: context.userId,
      completedAt: now.toISOString(),
      zeroObjectCount: remaining.length,
      authPurged: true,
      actorId: dependencies.systemContext.actorId,
      requestId: dependencies.systemContext.requestId,
    });
    return { status: "completed" as const, verification };
  } catch (error) {
    await control.failDeletion(record.id, context.userId, "PURGE_FAILED", now.toISOString());
    throw error;
  }
}

export function publicDeletion(record: AccountDeletionRecord) {
  return {
    id: record.id,
    status: record.status,
    requestedAt: record.requestedAt,
    purgeAfter: record.purgeAfter,
    updatedAt: record.updatedAt,
    cancelledAt: record.cancelledAt,
    completedAt: record.completedAt,
    failureCode: record.failureCode,
  };
}
