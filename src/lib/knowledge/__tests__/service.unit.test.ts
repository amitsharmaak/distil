import type { RepositorySet } from "@/lib/repositories/ports";
import type { PassageSearchResult, PassageSearchStore } from "../retrieval";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import {
  answerFromKnowledge,
  assertDateRange,
  classifyAnswerIntent,
  enqueueSummaryRegeneration,
  getItemIntelligence,
  validateGeneratedCitations,
} from "../service";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

const passage = (patch: Partial<PassageSearchResult> = {}): PassageSearchResult => ({
  itemId: "item-1",
  chunkId: "chunk-1",
  contentVersionId: "version-1",
  title: "Durable systems",
  url: "https://example.com/durable",
  sourceType: "manual",
  excerpt: "A durable queue persists accepted work before processing.",
  excerptStart: 0,
  excerptEnd: 56,
  score: 0.2,
  reasons: ["keyword:chunk_text"],
  retrievalMode: "keyword",
  degradation: [],
  ...patch,
});

const store = (results: PassageSearchResult[] = []): PassageSearchStore => ({
  searchKeyword: jest.fn().mockResolvedValue(results),
  listRecent: jest.fn().mockResolvedValue([]),
});

describe("grounded answer service", () => {
  it("validates chronological filter ranges", () => {
    expect(() => assertDateRange({ dateFrom: "2026-01-01", dateTo: "2026-01-02" })).not.toThrow();
    expect(() => assertDateRange({ dateFrom: "2026-01-03", dateTo: "2026-01-02" })).toThrow(
      "dateFrom must not be after dateTo"
    );
  });
  it("classifies only explicit briefing requests as general", () => {
    expect(classifyAnswerIntent("Brief me on my unread items")).toBe("general");
    expect(classifyAnswerIntent("How does the durable queue work?")).toBe("specific");
  });

  it("abstains on insufficient specific evidence without retrieving unrelated recent items", async () => {
    const repository = store([]);
    const result = await answerFromKnowledge({
      context,
      request: { query: "What did the article say about Mars?", messages: [] },
      store: repository,
    });
    expect(result).toMatchObject({ status: "abstained", intent: "specific", citations: [] });
    expect(repository.listRecent).not.toHaveBeenCalled();
  });

  it("allows recent fallback only for a general query", async () => {
    const repository = store([]);
    jest
      .mocked(repository.listRecent)
      .mockResolvedValue([passage({ retrievalMode: "recent_fallback" })]);
    const result = await answerFromKnowledge({
      context,
      request: { query: "Give me a brief of my library", messages: [] },
      store: repository,
    });
    expect(result).toMatchObject({
      status: "degraded",
      intent: "general",
      passagesUsed: 1,
      retrievalMode: "recent_fallback",
    });
    expect(repository.listRecent).toHaveBeenCalledTimes(1);
  });

  it("derives citation metadata from supplied passages and removes fabricated citations", () => {
    expect(
      validateGeneratedCitations(
        {
          answer: "Grounded",
          citations: [
            {
              itemId: "item-1",
              chunkId: "chunk-1",
              exactExcerpt: "persists accepted work",
            },
            { itemId: "item-1", chunkId: "missing", exactExcerpt: "fabricated" },
          ],
        },
        [passage()]
      )
    ).toEqual([
      expect.objectContaining({
        itemId: "item-1",
        chunkId: "chunk-1",
        exactExcerpt: "persists accepted work",
        url: "https://example.com/durable",
      }),
    ]);
  });

  it("deduplicates validated citations and rejects excerpts outside the supplied passage", () => {
    const exact = "persists accepted work";
    expect(
      validateGeneratedCitations(
        {
          answer: "Grounded",
          citations: [
            { itemId: "item-1", chunkId: "chunk-1", exactExcerpt: exact },
            { itemId: "item-1", chunkId: "chunk-1", exactExcerpt: exact },
            { itemId: "item-1", chunkId: "chunk-1", exactExcerpt: "not in source" },
          ],
        },
        [passage()]
      )
    ).toHaveLength(1);
  });

  it("passes at most six messages and falls back when generated citations are invalid", async () => {
    const generator = jest.fn().mockResolvedValue({
      answer: "Unsupported answer",
      citations: [{ itemId: "wrong", chunkId: "wrong", exactExcerpt: "invented" }],
    });
    const messages = Array.from({ length: 7 }, (_, index) => ({
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      content: `message ${index}`,
    }));
    const result = await answerFromKnowledge({
      context,
      request: { query: "How does the queue work?", messages },
      store: store([passage()]),
      generator,
    });
    expect(generator.mock.calls[0][0].messages).toHaveLength(6);
    expect(result).toMatchObject({ status: "degraded", citations: [expect.any(Object)] });
    expect(result.answer).not.toContain("Unsupported answer");
  });

  it("returns a generated answer only when its structure and citations are grounded", async () => {
    const generator = jest.fn().mockResolvedValue({
      answer: "The queue persists work.",
      citations: [{ itemId: "item-1", chunkId: "chunk-1", exactExcerpt: "persists accepted work" }],
    });
    await expect(
      answerFromKnowledge({
        context,
        request: { query: "How does the queue work?", messages: [], intent: "specific" },
        store: store([passage()]),
        generator,
      })
    ).resolves.toMatchObject({
      status: "ready",
      answer: "The queue persists work.",
      passagesUsed: 1,
      citations: [expect.objectContaining({ id: "citation-1" })],
    });
  });

  it("falls back deterministically for malformed or failed generation", async () => {
    const repository = store([passage()]);
    await expect(
      answerFromKnowledge({
        context,
        request: { query: "How does the queue work?", messages: [] },
        store: repository,
        generator: jest.fn().mockResolvedValue({ answer: "missing citations" }),
      })
    ).resolves.toMatchObject({ status: "degraded" });
    await expect(
      answerFromKnowledge({
        context,
        request: { query: "How does the queue work?", messages: [] },
        store: repository,
        generator: jest.fn().mockRejectedValue(new Error("provider unavailable")),
      })
    ).resolves.toMatchObject({ status: "degraded" });
  });

  it("rejects low-score specific evidence and abstains when general fallback is empty", async () => {
    await expect(
      answerFromKnowledge({
        context,
        request: { query: "Exact fact?", messages: [] },
        store: store([passage({ score: 0.001 })]),
      })
    ).resolves.toMatchObject({ status: "abstained", intent: "specific" });
    await expect(
      answerFromKnowledge({
        context,
        request: { query: "Brief my library", messages: [] },
        store: store([]),
      })
    ).resolves.toMatchObject({ status: "abstained", intent: "general" });
  });
});

describe("summary regeneration", () => {
  it("creates one pending artifact and durable deterministic job", async () => {
    const repositories = {
      items: { findById: jest.fn().mockResolvedValue({ id: "item-1" }) },
      contentVersions: {
        findLatestForItem: jest.fn().mockResolvedValue({ id: "version-1" }),
      },
      intelligenceArtifacts: {
        publish: jest.fn().mockImplementation(async (record) => ({
          record: { ...record, version: 2, isCurrent: false },
          created: true,
        })),
      },
      jobs: { enqueue: jest.fn() },
    } as unknown as RepositorySet;
    const result = await enqueueSummaryRegeneration(
      context,
      repositories,
      "item-1",
      { length: "brief", idempotencyKey: "retry-key" },
      new Date("2026-09-07T00:00:00Z")
    );
    expect(result.artifact).toMatchObject({ status: "pending", isCurrent: false });
    expect(repositories.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.jobId,
        jobType: "regenerate_intelligence_summary",
        payload: expect.stringContaining('"contentVersionId":"version-1"'),
      })
    );
  });

  it("rejects missing items and items without versioned content", async () => {
    const missing = {
      items: { findById: jest.fn().mockResolvedValue(undefined) },
    } as unknown as RepositorySet;
    await expect(
      enqueueSummaryRegeneration(context, missing, "missing", {
        length: "brief",
        idempotencyKey: "key",
      })
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND", status: 404 });

    const unversioned = {
      items: { findById: jest.fn().mockResolvedValue({ id: "item-1" }) },
      contentVersions: { findLatestForItem: jest.fn().mockResolvedValue(undefined) },
    } as unknown as RepositorySet;
    await expect(
      enqueueSummaryRegeneration(context, unversioned, "item-1", {
        length: "brief",
        idempotencyKey: "key",
      })
    ).rejects.toMatchObject({ code: "CONTENT_NOT_READY", status: 409 });
  });
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
        listForContentVersion: jest.fn().mockResolvedValue([
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
      contentChunks: { listForContentVersion: jest.fn() },
      intelligenceArtifacts: { listForItem: jest.fn().mockResolvedValue([]) },
      claims: { listForArtifact: jest.fn() },
    } as unknown as RepositorySet;
    await expect(getItemIntelligence(context, repositories, "item-1")).resolves.toMatchObject({
      contentVersion: null,
      chunks: [],
      artifacts: [],
      claims: [],
    });
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
