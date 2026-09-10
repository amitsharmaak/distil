import { createAuthContext } from "@/lib/contracts/tenant-context";
import { indexCapturedItem } from "../capture-index";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000010",
  actorKind: "system",
  actorId: "10000000-0000-4000-8000-000000000011",
  requestId: "10000000-0000-4000-8000-000000000012",
});

describe("captured item knowledge indexing", () => {
  it("creates deterministic versioned chunks and an extractive summary", async () => {
    const item = {
      id: "item-1",
      title: "HTTP caching",
      summary: "Saved for later",
      fullContent: "A private cache belongs to one client. A shared cache can serve many clients.",
      sourceType: "manual" as const,
      contentType: "article" as const,
      topics: [],
      url: "https://example.com/caching",
      priority: "medium" as const,
      isRead: false,
      createdAt: "2026-09-10T00:00:00.000Z",
      processingStatus: "ready" as const,
    };
    const contentVersions = {
      create: jest.fn(async (record) => ({
        record: { ...record, version: 1 },
        created: true,
      })),
    };
    const contentChunks = {
      insertMany: jest.fn(async (records) => ({ records, insertedCount: records.length })),
    };
    const intelligenceArtifacts = {
      publish: jest.fn(async (record) => ({
        record: { ...record, version: 1, isCurrent: true },
        created: true,
      })),
    };
    const repositories = {
      items: { findById: jest.fn().mockResolvedValue(item) },
      contentVersions,
      contentChunks,
      intelligenceArtifacts,
    };

    await expect(
      indexCapturedItem({
        context,
        repositories: repositories as never,
        itemId: item.id,
        now: () => new Date("2026-09-10T01:00:00.000Z"),
      })
    ).resolves.toMatchObject({ chunkCount: 1 });

    expect(contentVersions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^cv_/),
        itemId: item.id,
        source: "full_content",
        extractorVersion: "capture-v1",
      })
    );
    expect(contentChunks.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^chk_/),
        itemId: item.id,
        embeddingStatus: "unconfigured",
      }),
    ]);
    expect(intelligenceArtifacts.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^art_/),
        itemId: item.id,
        artifactType: "brief_summary",
        status: "degraded",
        makeCurrentIfNone: true,
      })
    );
  });
});
