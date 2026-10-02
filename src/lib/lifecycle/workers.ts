import { z } from "zod";

import type { TenantJobHandler } from "@/lib/jobs/tenant-runtime";
import type { AccountDeletionWorkerDependencies } from "./deletion";
import { processAccountDeletion } from "./deletion";
import {
  failAccountExportWithoutStorage,
  processAccountExport,
  purgeExpiredAccountExport,
} from "./exports";
import type { TenantObjectStore } from "@/lib/storage/object-store";

const exportPayloadSchema = z
  .object({ exportId: z.string().uuid(), jobId: z.string().uuid() })
  .strict();
const deletionPayloadSchema = z
  .object({ deletionId: z.string().uuid(), jobId: z.string().uuid() })
  .strict();

export function createAccountExportJobHandler(objectStore: TenantObjectStore): TenantJobHandler {
  return async (context, payload, repositories) => {
    const input = exportPayloadSchema.parse(payload);
    await processAccountExport(context, repositories, objectStore, input);
  };
}

/**
 * Runs when the export worker cannot resolve object storage (not configured,
 * misconfigured). The export leaves `pending` for a terminal `failed` so its
 * owner sees an outcome; the job still fails and is retried, and a retry after
 * storage is repaired reclaims the failed export.
 */
export const failAccountExportJobWithoutStorage: TenantJobHandler = async (
  _context,
  payload,
  repositories
) => {
  const input = exportPayloadSchema.safeParse(payload);
  if (input.success) await failAccountExportWithoutStorage(repositories, input.data.exportId);
};

export function createAccountExportRetentionJobHandler(
  objectStore: TenantObjectStore
): TenantJobHandler {
  return async (context, payload, repositories) => {
    const input = exportPayloadSchema.parse(payload);
    await purgeExpiredAccountExport(context, repositories, objectStore, input.exportId);
  };
}

export function createAccountDeletionJobHandler(
  dependencies: AccountDeletionWorkerDependencies
): TenantJobHandler {
  return async (context, payload, repositories) => {
    const input = deletionPayloadSchema.parse(payload);
    if (input.jobId !== input.deletionId) throw new Error("Deletion job/resource mismatch");
    await processAccountDeletion(context, repositories, dependencies, input);
  };
}
