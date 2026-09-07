import type { RepositorySet } from "@/lib/repositories/ports";
import type { PassageSearchResult, PassageSearchStore } from "../retrieval";
import {
  answerFromKnowledge,
  classifyAnswerIntent,
  enqueueSummaryRegeneration,
  getItemIntelligence,
  validateGeneratedCitations,
} from "../service";

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
  it("classifies only explicit briefing requests as general", () => {
    expect(classifyAnswerIntent("Brief me on my unread items")).toBe("general");
    expect(classifyAnswerIntent("How does the durable queue work?")).toBe("specific");
  });

  it("abstains on insufficient specific evidence without retrieving unrelated recent items", async () => {
    const repository = store([]);
    const result = await answerFromKnowledge({
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
      request: { query: "How does the queue work?", messages },
      store: store([passage()]),
      generator,
    });
    expect(generator.mock.calls[0][0].messages).toHaveLength(6);
    expect(result).toMatchObject({ status: "degraded", citations: [expect.any(Object)] });
    expect(result.answer).not.toContain("Unsupported answer");
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
    const intelligence = await getItemIntelligence(repositories, "item-1");
    expect(intelligence).toMatchObject({
      item: { id: "item-1" },
      contentVersion: { id: "version-1", version: 1 },
      chunks: [{ id: "chunk-1", embeddingStatus: "unconfigured" }],
      claims: [{ id: "claim-1" }],
    });
    expect(intelligence.contentVersion).not.toHaveProperty("content");
  });
});
