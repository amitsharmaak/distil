import {
  createAuthContext,
  parseSystemContext,
  type AuthContext,
  type SystemContext,
  type UserId,
} from "@/lib/contracts/tenant-context";
import type { ControlPlaneRepositorySet, RepositorySet } from "@/lib/repositories/ports";

export interface TenantCronDependencies {
  getControlPlaneRepositories(context: SystemContext): Promise<ControlPlaneRepositorySet>;
  getTenantRepositories(context: AuthContext): Promise<RepositorySet>;
}

/** Paginates opaque account ids and performs one bounded tenant operation at a time. */
export async function forEachActiveTenant(
  systemContext: SystemContext,
  dependencies: TenantCronDependencies,
  operation: (context: AuthContext, repositories: RepositorySet) => Promise<boolean>,
  pageSize = 100
): Promise<{ visited: number; enqueued: number }> {
  const system = parseSystemContext(systemContext);
  const control = await dependencies.getControlPlaneRepositories(system);
  let afterUserId: UserId | undefined;
  let visited = 0;
  let enqueued = 0;
  while (true) {
    const userIds = await control.accounts.listActiveUserIds({ afterUserId, limit: pageSize });
    for (const userId of userIds) {
      const context = createAuthContext({
        userId,
        actorKind: "system",
        actorId: system.actorId,
        requestId: system.requestId,
      });
      const repositories = await dependencies.getTenantRepositories(context);
      visited += 1;
      if (await operation(context, repositories)) enqueued += 1;
    }
    if (userIds.length < pageSize) break;
    afterUserId = userIds.at(-1);
  }
  return { visited, enqueued };
}
