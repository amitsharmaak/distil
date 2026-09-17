jest.mock("../embeddings", () => {
  const actual = jest.requireActual("../embeddings");
  return { ...actual, generateEmbedding: jest.fn() };
});

import { generateEmbedding } from "../embeddings";
import { hybridSearch } from "../search";
import type { RepositorySet } from "@/lib/repositories/ports";

const item = {
  id: "item-1",
  title: "A useful article",
  summary: "Useful material",
  sourceType: "manual",
  contentType: "article",
  topics: [],
  url: "https://example.com/article",
  priority: "medium",
  isRead: false,
  createdAt: "2026-09-17T00:00:00.000Z",
} as const;

function repositories(count: number) {
  return {
    items: {
      list: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(item),
    },
    embeddings: {
      count: jest.fn().mockResolvedValue(count),
      listRecent: jest.fn().mockResolvedValue([{ itemId: item.id, embedding: [1, 0] }]),
    },
  } as unknown as RepositorySet;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(generateEmbedding).mockResolvedValue([1, 0]);
});

it("does not call an embedding provider when the tenant has no stored embeddings", async () => {
  const repos = repositories(0);
  await expect(hybridSearch(repos, "useful")).resolves.toEqual([]);
  expect(repos.embeddings.count).toHaveBeenCalledTimes(1);
  expect(generateEmbedding).not.toHaveBeenCalled();
  expect(repos.embeddings.listRecent).not.toHaveBeenCalled();
});

it("bounds semantic candidates to 500 after confirming embeddings exist", async () => {
  const repos = repositories(1);
  await expect(hybridSearch(repos, "useful")).resolves.toEqual([item]);
  expect(generateEmbedding).toHaveBeenCalledTimes(1);
  expect(repos.embeddings.listRecent).toHaveBeenCalledWith(90, 500);
});
