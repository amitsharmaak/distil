import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type { JobQueueRepository, RepositorySet } from "@/lib/repositories/ports";
import {
  createKnowledgeBackfillJobHandler,
  enqueueKnowledgeBackfill,
  type KnowledgeBackfillKind,
  type KnowledgeBackfillRepositories,
} from "./jobs";

function scopedRepositories(
  context: AuthContext,
  repositories: RepositorySet
): KnowledgeBackfillRepositories {
  const jobs: JobQueueRepository = {
    ...repositories.jobs,
    enqueue: (input) =>
      repositories.jobs.enqueue({
        ...input,
        userId: context.userId,
        idempotencyKey: input.idempotencyKey ?? input.id,
      }),
  };
  return { ...repositories, jobs };
}

/** Creates one user-specific checkpoint and keeps all continuation jobs in that tenant. */
export async function enqueueTenantKnowledgeBackfill(
  context: AuthContext,
  repositories: RepositorySet,
  input: {
    kind: KnowledgeBackfillKind;
    scope?: string;
    batchSize?: number;
    extractorVersion?: string;
    now?: () => Date;
  }
) {
  const trusted = parseAuthContext(context);
  return enqueueKnowledgeBackfill({
    ...input,
    context: trusted,
    repositories: scopedRepositories(trusted, repositories),
  });
}

export function createTenantKnowledgeBackfillJobHandler(
  context: AuthContext,
  repositories: RepositorySet
) {
  const trusted = parseAuthContext(context);
  return createKnowledgeBackfillJobHandler(trusted, scopedRepositories(trusted, repositories));
}
