import { createAuthContext } from "@/lib/contracts/tenant-context";

import { getTenantPublisherQueue, TenantPublisherQueue } from "../tenant-queue";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId: "30000000-0000-4000-8000-000000000001",
});

function repositories() {
  return {
    publisherQueue: {
      enqueue: jest.fn(),
      listPending: jest.fn(),
      markFetched: jest.fn(),
      markFailed: jest.fn(),
    },
  };
}

describe("tenant publisher queue", () => {
  it("binds enqueues to the authenticated tenant instead of caller input", async () => {
    const repos = repositories();
    const queue = new TenantPublisherQueue(context, repos as never);

    await queue.enqueue("the-ken", "https://the-ken.com/article");

    expect(repos.publisherQueue.enqueue).toHaveBeenCalledWith({
      userId,
      publisherId: "the-ken",
      url: "https://the-ken.com/article",
    });
  });

  it("filters a confused-deputy queue response even when the repository leaks it", async () => {
    const repos = repositories();
    repos.publisherQueue.listPending.mockResolvedValue([
      { userId, publisherId: "the-ken", url: "https://the-ken.com/own" },
      { userId: otherUserId, publisherId: "the-ken", url: "https://the-ken.com/foreign" },
    ]);
    const queue = new TenantPublisherQueue(context, repos as never);

    await expect(queue.nextPending("the-ken", 7)).resolves.toEqual([
      { userId, publisherId: "the-ken", url: "https://the-ken.com/own" },
    ]);
    expect(repos.publisherQueue.listPending).toHaveBeenCalledWith("the-ken", 7);
  });

  it("uses a bounded default batch size when callers do not choose one", async () => {
    const repos = repositories();
    repos.publisherQueue.listPending.mockResolvedValue([]);

    await expect(
      new TenantPublisherQueue(context, repos as never).nextPending("the-ken")
    ).resolves.toEqual([]);
    expect(repos.publisherQueue.listPending).toHaveBeenCalledWith("the-ken", 20);
  });

  it("does not provide a user id to mutation methods after the repository is tenant-bound", async () => {
    const repos = repositories();
    const queue = new TenantPublisherQueue(context, repos as never);

    await queue.markFetched("the-ken", "https://the-ken.com/fetched");
    await queue.markFailed("the-ken", "https://the-ken.com/failed", "upstream timeout");

    expect(repos.publisherQueue.markFetched).toHaveBeenCalledWith(
      "the-ken",
      "https://the-ken.com/fetched"
    );
    expect(repos.publisherQueue.markFailed).toHaveBeenCalledWith(
      "the-ken",
      "https://the-ken.com/failed",
      "upstream timeout"
    );
  });

  it("validates context before resolving repositories and passes the trusted value through", async () => {
    const getRepositories = jest.fn().mockResolvedValue(repositories());
    const forged = { ...context, actorId: otherUserId };

    await expect(
      getTenantPublisherQueue(forged as never, getRepositories as never)
    ).rejects.toThrow("actorId must match userId");
    expect(getRepositories).not.toHaveBeenCalled();

    const queue = await getTenantPublisherQueue(context, getRepositories as never);
    expect(queue).toBeInstanceOf(TenantPublisherQueue);
    expect(getRepositories).toHaveBeenCalledWith(context);
  });
});
