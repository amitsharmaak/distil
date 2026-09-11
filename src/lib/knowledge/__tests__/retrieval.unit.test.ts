import {
  PostgresPassageSearchStore,
  searchPassages,
  UNPINNED_SEMANTIC_DEGRADATION,
  validateEmbeddingSpace,
  type PassageSearchStore,
} from "../retrieval";
import type { Sql } from "postgres";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { answerFromKnowledge } from "../service";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});
const foreignUserId = "20000000-0000-4000-8000-000000000002";

function sqlDouble(responses: unknown[][]) {
  const queries: string[] = [];
  const sql = jest.fn((strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if (!("raw" in strings)) return { values: strings };
    queries.push(strings.join("?"));
    return {
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(responses.shift() ?? []).then(resolve, reject);
      },
      values,
    };
  }) as unknown as Sql;
  Object.assign(sql, { array: jest.fn((value: unknown) => value) });
  return { sql, queries };
}

const row = {
  user_id: context.userId,
  item_id: "item-1",
  chunk_id: "chunk-1",
  content_version_id: "version-1",
  title: "Durable systems",
  url: "https://example.com/durable",
  source_type: "manual",
  excerpt: "Durable queues persist work.",
  score: 0.12345678,
  chunk_match: true,
  metadata_match: false,
  is_read: false,
};

describe("retrieval contracts", () => {
  it("requires vectors to match one pinned provider/model/version space", () => {
    const space = { provider: "provider", model: "embed-v1", version: "2026-09", dimensions: 3 };
    expect(() => validateEmbeddingSpace(space, [0.1, 0.2, 0.3])).not.toThrow();
    expect(() => validateEmbeddingSpace(space, [0.1, 0.2])).toThrow(/pinned vector space/);
    expect(() => validateEmbeddingSpace({ ...space, model: "" }, [0.1, 0.2, 0.3])).toThrow(
      /must pin/
    );
    expect(() => validateEmbeddingSpace({ ...space, provider: " " }, [0.1, 0.2, 0.3])).toThrow(
      /must pin/
    );
    expect(() => validateEmbeddingSpace({ ...space, dimensions: 1.5 }, [0.1])).toThrow(/must pin/);
    expect(() => validateEmbeddingSpace(space, [0.1, Number.NaN, 0.3])).toThrow(/pinned vector/);
  });

  it("does not query PostgreSQL for a blank keyword query", async () => {
    const fake = sqlDouble([]);
    const store = new PostgresPassageSearchStore(fake.sql, context);
    await expect(store.searchKeyword({ query: "   " })).resolves.toEqual([]);
    expect(fake.queries).toEqual([]);
  });

  it("normalizes keyword queries and reports semantic degradation", async () => {
    const store: PassageSearchStore = {
      searchKeyword: jest.fn().mockResolvedValue([]),
      listRecent: jest.fn(),
    };
    await expect(searchPassages(store, { query: "  durable knowledge  " })).resolves.toEqual({
      query: "durable knowledge",
      results: [],
      retrievalMode: "keyword",
      degradation: [UNPINNED_SEMANTIC_DEGRADATION],
    });
    expect(store.searchKeyword).toHaveBeenCalledWith({ query: "durable knowledge" });
  });

  it("builds filtered keyword and general fallback queries and maps stable passage metadata", async () => {
    const fake = sqlDouble([[row], [{ ...row, is_read: true, score: 2 }]]);
    const store = new PostgresPassageSearchStore(fake.sql, context);
    await expect(
      store.searchKeyword({
        query: "durable",
        read: false,
        archive: "only",
        topics: ["systems"],
        sources: ["manual"],
        contentTypes: ["article"],
        priorities: ["high"],
        collectionIds: ["saved"],
        dateFrom: "2026-01-01T00:00:00Z",
        dateTo: "2026-12-31T00:00:00Z",
        limit: 5,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        itemId: "item-1",
        excerpt: "Durable queues persist work.",
        score: 0.123457,
        reasons: ["keyword:chunk_text"],
        retrievalMode: "keyword",
      }),
    ]);
    await expect(store.listRecent({ archive: "include", limit: 5 })).resolves.toEqual([
      expect.objectContaining({
        itemId: "item-1",
        reasons: ["recent:high_priority"],
        retrievalMode: "recent_fallback",
      }),
    ]);
    const queries = fake.queries.join("\n");
    expect(queries).toContain("filtered_items");
    expect(queries).toContain("collection_items");
    expect(queries).toContain("ORDER BY score DESC");
    expect(queries).toContain("i.is_read=false");
  });

  it("applies default archive exclusion, clamps limits, and reports both keyword reasons", async () => {
    const fake = sqlDouble([
      [{ ...row, chunk_match: true, metadata_match: true }],
      [{ ...row, is_read: false, score: 1 }],
    ]);
    const store = new PostgresPassageSearchStore(fake.sql, context);
    await expect(store.searchKeyword({ query: "durable", limit: 500 })).resolves.toEqual([
      expect.objectContaining({ reasons: ["keyword:chunk_text", "keyword:item_metadata"] }),
    ]);
    await expect(store.listRecent({ limit: 0 })).resolves.toEqual([
      expect.objectContaining({ reasons: ["recent:unread"] }),
    ]);
    expect(fake.queries.join("\n")).toContain("i.archived_at IS NULL");
  });

  it("renders snippets as plain text so stored reader HTML never reaches the UI", async () => {
    const htmlExcerpt =
      '<h2>Durable queues</h2><p>Work is <strong>never</strong> lost &amp; retried.</p><div class="foot';
    const fake = sqlDouble([
      [{ ...row, excerpt: htmlExcerpt }],
      [{ ...row, excerpt: htmlExcerpt }],
    ]);
    const store = new PostgresPassageSearchStore(fake.sql, context);
    const expected = "Durable queues Work is never lost & retried.";
    await expect(store.searchKeyword({ query: "durable" })).resolves.toEqual([
      expect.objectContaining({
        excerpt: expected,
        excerptStart: 0,
        excerptEnd: expected.length,
      }),
    ]);
    await expect(store.listRecent({})).resolves.toEqual([
      expect.objectContaining({ excerpt: expected, excerptEnd: expected.length }),
    ]);
  });

  it("fails before answer generation when a cross-tenant canary reaches the row mapper", async () => {
    const fake = sqlDouble([[{ ...row, user_id: foreignUserId }]]);
    const store = new PostgresPassageSearchStore(fake.sql, context);
    const generator = jest.fn();

    await expect(
      answerFromKnowledge({
        context,
        request: { query: "durable queue", messages: [] },
        store,
        generator,
      })
    ).rejects.toThrow("Tenant passage invariant failed");

    expect(generator).not.toHaveBeenCalled();
    expect(fake.queries.join("\n")).toContain("i.user_id=");
  });
});
