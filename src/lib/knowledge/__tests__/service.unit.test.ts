import type { RepositorySet } from "@/lib/repositories/ports";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { getItemIntelligence } from "../service";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

describe("item intelligence", () => {
  it("returns current version metadata, chunk state, artifact history, and grounded claims", async () => {
    const repositories = {
      items: {
        findById: jest.fn().mockResolvedValue({
          id: "item-1",
          title: "Item",
          url: "https://example.com/item",
        }),
      },
      contentVersions: {
        findLatestForItem: jest.fn().mockResolvedValue({
          id: "version-1",
          version: 1,
          content: "private full content",
          contentHash: "sha256:hash",
          extractorVersion: "v1",
          source: "full_content",
          characterCount: 20,
          tokenCount: 4,
          createdAt: "2026-09-07T00:00:00Z",
        }),
      },
      contentChunks: {
        listForContentVersion: jest.fn(),
        listMetadataForContentVersion: jest.fn().mockResolvedValue([
          {
            id: "chunk-1",
            ordinal: 0,
            startOffset: 0,
            endOffset: 20,
            tokenCount: 4,
            embeddingStatus: "unconfigured",
          },
        ]),
      },
      intelligenceArtifacts: {
        listForItem: jest
          .fn()
          .mockResolvedValue([{ id: "claims-1", artifactType: "claims", isCurrent: true }]),
      },
      claims: { listForArtifact: jest.fn().mockResolvedValue([{ id: "claim-1" }]) },
    } as unknown as RepositorySet;
    const intelligence = await getItemIntelligence(context, repositories, "item-1");
    expect(intelligence).toMatchObject({
      item: { id: "item-1" },
      contentVersion: { id: "version-1", version: 1 },
      chunks: [{ id: "chunk-1", embeddingStatus: "unconfigured" }],
      claims: [{ id: "claim-1" }],
    });
    expect(intelligence.contentVersion).not.toHaveProperty("content");
    // The envelope never carries chunk text, so only chunk metadata is read.
    expect(repositories.contentChunks.listMetadataForContentVersion).toHaveBeenCalledWith(
      "version-1"
    );
    expect(repositories.contentChunks.listForContentVersion).not.toHaveBeenCalled();
  });

  it("issues the version and artifact reads concurrently, then chunks and claims", async () => {
    const deferred = <T>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((done) => (resolve = done));
      return { promise, resolve };
    };
    const version = deferred<{ id: string }>();
    const artifacts = deferred<Array<{ id: string; artifactType: string; isCurrent: boolean }>>();
    const chunks = deferred<unknown[]>();
    const claims = deferred<unknown[]>();
    const repositories = {
      items: { findById: jest.fn().mockResolvedValue({ id: "item-1", title: "Item", url: "u" }) },
      contentVersions: { findLatestForItem: jest.fn(() => version.promise) },
      intelligenceArtifacts: { listForItem: jest.fn(() => artifacts.promise) },
      contentChunks: { listMetadataForContentVersion: jest.fn(() => chunks.promise) },
      claims: { listForArtifact: jest.fn(() => claims.promise) },
    } as unknown as RepositorySet;

    const pending = getItemIntelligence(context, repositories, "item-1");
    await new Promise((tick) => setImmediate(tick));
    // First wave: both reads are in flight before either has resolved.
    expect(repositories.contentVersions.findLatestForItem).toHaveBeenCalledWith("item-1");
    expect(repositories.intelligenceArtifacts.listForItem).toHaveBeenCalledWith("item-1");
    expect(repositories.contentChunks.listMetadataForContentVersion).not.toHaveBeenCalled();
    expect(repositories.claims.listForArtifact).not.toHaveBeenCalled();

    version.resolve({ id: "version-1" });
    artifacts.resolve([{ id: "claims-1", artifactType: "claims", isCurrent: true }]);
    await new Promise((tick) => setImmediate(tick));
    // Second wave: chunk metadata and claims are in flight together.
    expect(repositories.contentChunks.listMetadataForContentVersion).toHaveBeenCalledWith(
      "version-1"
    );
    expect(repositories.claims.listForArtifact).toHaveBeenCalledWith("claims-1");

    chunks.resolve([]);
    claims.resolve([{ id: "claim-1" }]);
    await expect(pending).resolves.toMatchObject({
      contentVersion: { id: "version-1" },
      chunks: [],
      claims: [{ id: "claim-1" }],
    });
  });

  it("returns an empty intelligence envelope when content has not been versioned", async () => {
    const repositories = {
      items: {
        findById: jest.fn().mockResolvedValue({
          id: "item-1",
          title: "Item",
          url: "https://example.com/item",
        }),
      },
      contentVersions: { findLatestForItem: jest.fn().mockResolvedValue(undefined) },
      contentChunks: { listForContentVersion: jest.fn(), listMetadataForContentVersion: jest.fn() },
      intelligenceArtifacts: { listForItem: jest.fn().mockResolvedValue([]) },
      claims: { listForArtifact: jest.fn() },
    } as unknown as RepositorySet;
    await expect(getItemIntelligence(context, repositories, "item-1")).resolves.toMatchObject({
      contentVersion: null,
      chunks: [],
      artifacts: [],
      claims: [],
    });
    expect(repositories.contentChunks.listMetadataForContentVersion).not.toHaveBeenCalled();
    expect(repositories.contentChunks.listForContentVersion).not.toHaveBeenCalled();
    expect(repositories.claims.listForArtifact).not.toHaveBeenCalled();
  });

  it("rejects a missing item", async () => {
    const repositories = {
      items: { findById: jest.fn().mockResolvedValue(undefined) },
    } as unknown as RepositorySet;
    await expect(getItemIntelligence(context, repositories, "missing")).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
      status: 404,
    });
  });
});
