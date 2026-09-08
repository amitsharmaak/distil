import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type { PublisherQueueEntry, RepositorySet } from "@/lib/repositories/ports";

/** Tenant-bound publisher queue; URLs never cross a user repository view. */
export class TenantPublisherQueue {
  private readonly context: AuthContext;

  constructor(
    context: AuthContext,
    private readonly repositories: Pick<RepositorySet, "publisherQueue">
  ) {
    this.context = parseAuthContext(context);
  }

  async enqueue(publisherId: string, url: string): Promise<void> {
    await this.repositories.publisherQueue.enqueue({
      userId: this.context.userId,
      publisherId,
      url,
    });
  }

  async nextPending(publisherId: string, limit = 20): Promise<PublisherQueueEntry[]> {
    const entries = await this.repositories.publisherQueue.listPending(publisherId, limit);
    // RLS/view predicates are primary; this is independent confused-deputy defense.
    return entries.filter((entry) => entry.userId === this.context.userId);
  }

  async markFetched(publisherId: string, url: string): Promise<void> {
    await this.repositories.publisherQueue.markFetched(publisherId, url);
  }

  async markFailed(publisherId: string, url: string, error: string): Promise<void> {
    await this.repositories.publisherQueue.markFailed(publisherId, url, error);
  }
}

export async function getTenantPublisherQueue(
  context: AuthContext,
  getTenantRepositories: (context: AuthContext) => Promise<RepositorySet>
): Promise<TenantPublisherQueue> {
  const trusted = parseAuthContext(context);
  return new TenantPublisherQueue(trusted, await getTenantRepositories(trusted));
}
