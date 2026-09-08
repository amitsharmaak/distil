import { createSystemContext, type AuthContext, type SystemContext } from "@/lib/contracts";
import type { TenantJobEnvelopeV1 } from "@/lib/contracts/tenant-jobs";
import { getControlPlaneRepositories, getTenantRepositories } from "@/lib/database";
import {
  consumeTenantJobEnvelope,
  type TenantJobHandler,
  type TenantJobRuntimeDependencies,
} from "@/lib/jobs/tenant-runtime";
import type { AuthAccountPurger, ControlPlaneLifecycleRepository } from "@/lib/lifecycle/ports";
import { getLifecycleAuthPurger } from "@/lib/lifecycle/auth-purger-runtime";
import { getLifecycleObjectStore } from "@/lib/lifecycle/object-store-runtime";
import type { TenantObjectStore } from "@/lib/storage/object-store";

import { ACCOUNT_DELETION_JOB_TYPE, type AccountDeletionWorkerDependencies } from "./deletion";
import { ACCOUNT_EXPORT_JOB_TYPE, ACCOUNT_EXPORT_RETENTION_JOB_TYPE } from "./exports";
import {
  createAccountDeletionJobHandler,
  createAccountExportJobHandler,
  createAccountExportRetentionJobHandler,
} from "./workers";

export const ACCOUNT_LIFECYCLE_WORKER_ID = "account-lifecycle-worker";
export const ACCOUNT_LIFECYCLE_SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000005";

export interface LifecycleQueueRuntimeDependencies {
  getTenantRepositories?: TenantJobRuntimeDependencies["getTenantRepositories"];
  getObjectStore?: () => TenantObjectStore;
  getAuthPurger?: () => AuthAccountPurger;
  getControlPlaneLifecycle?: (context: SystemContext) => Promise<ControlPlaneLifecycleRepository>;
  createSystemContext?: (context: AuthContext) => SystemContext;
}

function defaultControlPlaneLifecycle(context: SystemContext) {
  return getControlPlaneRepositories(context).then(({ lifecycle }) => lifecycle);
}

/**
 * Exact lifecycle allowlist used by the queue callback. Dependency resolution
 * stays lazy so unavailable production integrations fail a claimed job before
 * any handler has a chance to mutate tenant data.
 */
export function createLifecycleTenantJobHandlers(
  dependencies: LifecycleQueueRuntimeDependencies = {}
): ReadonlyMap<string, TenantJobHandler> {
  const getObjectStore = dependencies.getObjectStore ?? getLifecycleObjectStore;
  const getAuthPurger = dependencies.getAuthPurger ?? getLifecycleAuthPurger;
  const getControlPlaneLifecycle =
    dependencies.getControlPlaneLifecycle ?? defaultControlPlaneLifecycle;
  const systemContext =
    dependencies.createSystemContext ??
    ((context: AuthContext) =>
      createSystemContext({
        actorKind: "system",
        actorId: ACCOUNT_LIFECYCLE_SYSTEM_ACTOR_ID,
        requestId: context.requestId,
      }));

  const handlers = new Map<string, TenantJobHandler>();
  handlers.set(ACCOUNT_EXPORT_JOB_TYPE, async (context, payload, repositories) => {
    await createAccountExportJobHandler(getObjectStore())(context, payload, repositories);
  });
  handlers.set(ACCOUNT_EXPORT_RETENTION_JOB_TYPE, async (context, payload, repositories) => {
    await createAccountExportRetentionJobHandler(getObjectStore())(context, payload, repositories);
  });
  handlers.set(ACCOUNT_DELETION_JOB_TYPE, async (context, payload, repositories) => {
    // Resolve mandatory dependencies before processAccountDeletion can mark a
    // request as purging or delete any tenant object.
    const authPurger = getAuthPurger();
    const objectStore = getObjectStore();
    const deletionDependencies: AccountDeletionWorkerDependencies = {
      objectStore,
      authPurger,
      getControlPlaneLifecycle,
      systemContext: systemContext(context),
    };
    await createAccountDeletionJobHandler(deletionDependencies)(context, payload, repositories);
  });
  return handlers;
}

/** Runs a persisted lifecycle job through the trusted tenant-scoped runtime. */
export async function consumeLifecycleTenantJobEnvelope(
  envelope: TenantJobEnvelopeV1,
  dependencies: LifecycleQueueRuntimeDependencies = {}
) {
  return consumeTenantJobEnvelope(envelope, {
    getTenantRepositories: dependencies.getTenantRepositories ?? getTenantRepositories,
    handlers: createLifecycleTenantJobHandlers(dependencies),
    workerId: ACCOUNT_LIFECYCLE_WORKER_ID,
  });
}
