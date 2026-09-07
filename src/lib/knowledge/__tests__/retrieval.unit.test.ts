import {
  PostgresPassageSearchStore,
  searchPassages,
  UNPINNED_SEMANTIC_DEGRADATION,
  validateEmbeddingSpace,
  type PassageSearchStore,
} from "../retrieval";
import type { Sql } from "postgres";

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
    const store = new PostgresPassageSearchStore(fake.sql);
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
});
