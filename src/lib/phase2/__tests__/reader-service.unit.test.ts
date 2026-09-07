import type { RepositorySet } from "@/lib/repositories/ports";
import {
  annotationCreateSchema,
  collectionCreateSchema,
  parseBody,
  ReaderError,
  stateSchema,
  updateItemState,
} from "@/lib/phase2/reader-service";

function repositorySet(overrides: Record<string, unknown> = {}): RepositorySet {
  const item = {
    id: "item-1",
    title: "A saved article",
    summary: "Summary",
    sourceType: "manual" as const,
    contentType: "article" as const,
    topics: [],
    url: "https://example.com/article",
    priority: "medium" as const,
    isRead: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    readingProgress: 0,
  };
  return {
    items: { findById: jest.fn().mockResolvedValue(item), update: jest.fn().mockImplementation(async (_id, patch) => ({ ...item, ...patch })) },
    itemEvents: { append: jest.fn().mockImplementation(async (event) => event) },
    ...overrides,
  } as unknown as RepositorySet;
}

describe("Phase 2 reader service contracts", () => {
  it("rejects unknown state fields and non-milestone progress", () => {
    expect(() => parseBody({ isRead: true, typo: true }, stateSchema)).toThrow(ReaderError);
    expect(() => parseBody({ readingProgress: 0.4 }, stateSchema)).toThrow(ReaderError);
  });

  it("enforces strict annotation and collection payloads", () => {
    expect(() => parseBody({ selectedQuote: "quote", contentHash: "h", contentVersion: "v", extra: true }, annotationCreateSchema)).toThrow(ReaderError);
    expect(() => parseBody({ name: "Inbox", extra: true }, collectionCreateSchema)).toThrow(ReaderError);
  });

  it("records read and completion transitions while preserving idempotent event keys", async () => {
    const repositories = repositorySet();
    const item = await updateItemState(repositories, "item-1", parseBody({ readingProgress: 1, idempotencyKey: "reader-1" }, stateSchema));
    expect(item.isRead).toBe(true);
    expect(item.readingProgress).toBe(1);
    expect(repositories.itemEvents.append).toHaveBeenCalledWith(expect.objectContaining({ eventType: "completed", eventKey: "item-1:reader-1:completed" }));
    expect(repositories.items.update).toHaveBeenCalledWith("item-1", expect.objectContaining({ isRead: true, readingProgress: 1 }));
  });

  it("uses 404 for missing items", async () => {
    const repositories = repositorySet({ items: { findById: jest.fn().mockResolvedValue(undefined) } });
    await expect(updateItemState(repositories, "missing", parseBody({ isRead: true }, stateSchema))).rejects.toMatchObject({ code: "ITEM_NOT_FOUND", status: 404 });
  });
});
