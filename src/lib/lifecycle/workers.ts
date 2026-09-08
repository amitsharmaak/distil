import { z } from "zod";

import type { TenantJobHandler } from "@/lib/jobs/tenant-runtime";
import type { AccountDeletionWorkerDependencies } from "./deletion";
import { processAccountDeletion } from "./deletion";
import { processAccountExport, purgeExpiredAccountExport } from "./exports";
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
