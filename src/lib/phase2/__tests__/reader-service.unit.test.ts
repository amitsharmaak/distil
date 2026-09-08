import type { RepositorySet } from "@/lib/repositories/ports";
import {
  addCollectionItem,
  annotationCreateSchema,
  annotationUpdateSchema,
  collectionCreateSchema,
  collectionUpdateSchema,
  createAnnotation,
  createCollection,
  deleteAnnotation,
  deleteCollection,
  deleteNote,
  getCollection,
  getNote,
  listCollections,
  parseBody,
  putNote,
  removeCollectionItem,
  ReaderError,
  stateSchema,
  updateAnnotation,
  updateCollection,
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
    items: {
      findById: jest.fn().mockResolvedValue(item),
      update: jest.fn().mockImplementation(async (_id, patch) => ({ ...item, ...patch })),
    },
    itemEvents: { append: jest.fn().mockImplementation(async (event) => event) },
    ...overrides,
  } as unknown as RepositorySet;
}

function fullRepositorySet(overrides: Record<string, unknown> = {}): RepositorySet {
  return repositorySet({
    itemNotes: {
      find: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockImplementation(async (note) => note),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    annotations: {
      listForItem: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async (annotation) => annotation),
      update: jest.fn().mockImplementation(async (id, patch) => ({ id, ...patch })),
      delete: jest.fn().mockResolvedValue(true),
    },
    collections: {
      list: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue({ id: "collection-1", name: "Reading" }),
      create: jest.fn().mockImplementation(async (collection) => collection),
      update: jest.fn().mockImplementation(async (id, patch) => ({ id, ...patch })),
      delete: jest.fn().mockResolvedValue(true),
      listItems: jest.fn().mockResolvedValue([]),
      addItem: jest.fn().mockImplementation(async (membership) => membership),
      removeItem: jest.fn().mockResolvedValue(true),
    },
    ...overrides,
  });
}

describe("Phase 2 reader service contracts", () => {
  it("rejects unknown state fields and non-milestone progress", () => {
    expect(() => parseBody({ isRead: true, typo: true }, stateSchema)).toThrow(ReaderError);
    expect(() => parseBody({ readingProgress: 0.4 }, stateSchema)).toThrow(ReaderError);
  });

  it("validates annotation and collection payload variants", () => {
    expect(() =>
      parseBody(
        { selectedQuote: "quote", contentHash: "h", contentVersion: "v", extra: true },
        annotationCreateSchema
      )
    ).toThrow(ReaderError);
    expect(() => parseBody({ name: "Inbox", extra: true }, collectionCreateSchema)).toThrow(
      ReaderError
    );
    expect(parseBody({ name: "Inbox", description: null }, collectionCreateSchema)).toMatchObject({
      name: "Inbox",
      description: null,
    });
    expect(
      parseBody(
        {
          selectedQuote: "quote",
          contentHash: "h",
          contentVersion: "v",
          startOffset: 2,
          endOffset: 7,
        },
        annotationCreateSchema
      )
    ).toMatchObject({ prefix: "", suffix: "", startOffset: 2, endOffset: 7 });
    expect(() => parseBody({}, annotationUpdateSchema)).toThrow(ReaderError);
    expect(() => parseBody({ startOffset: 3 }, annotationUpdateSchema)).toThrow(ReaderError);
    expect(
      parseBody({ status: "orphaned", startOffset: null, endOffset: null }, annotationUpdateSchema)
    ).toMatchObject({ status: "orphaned" });
    expect(() => parseBody({ name: "Inbox" }, collectionUpdateSchema)).not.toThrow();
  });

  it("records read and completion transitions while preserving idempotent event keys", async () => {
    const repositories = repositorySet();
    const item = await updateItemState(
      repositories,
      "item-1",
      parseBody({ readingProgress: 1, idempotencyKey: "reader-1" }, stateSchema)
    );
    expect(item.isRead).toBe(true);
    expect(item.readingProgress).toBe(1);
    expect(repositories.itemEvents.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "completed", eventKey: "item-1:reader-1:completed" })
    );
    expect(repositories.items.update).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ isRead: true, readingProgress: 1 })
    );
  });

  it("records read, archive, and priority transitions together", async () => {
    const repositories = repositorySet({
      items: {
        findById: jest.fn().mockResolvedValue({
          id: "item-1",
          isRead: false,
          archivedAt: null,
          readingProgress: 0.25,
          manualPriority: "low",
        }),
        update: jest.fn().mockImplementation(async (_id, patch) => ({ id: "item-1", ...patch })),
      },
    });
    await updateItemState(repositories, "item-1", {
      isRead: true,
      archived: true,
      readingProgress: 0.5,
      manualPriority: "high",
      idempotencyKey: "state-1",
    });
    expect(repositories.items.update).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({
        isRead: true,
        archivedAt: expect.any(String),
        manualPriority: "high",
      })
    );
    expect(repositories.itemEvents.append).toHaveBeenCalledTimes(2);
  });

  it("handles unchanging state, restoring, and completion transitions", async () => {
    const repositories = repositorySet({
      items: {
        findById: jest
          .fn()
          .mockResolvedValueOnce({
            id: "item-1",
            isRead: true,
            archivedAt: "2026-01-02T00:00:00.000Z",
            readingProgress: 0.5,
            manualPriority: "high",
          })
          .mockResolvedValueOnce({
            id: "item-1",
            isRead: true,
            archivedAt: "2026-01-02T00:00:00.000Z",
            readingProgress: 0,
            manualPriority: "high",
          })
          .mockResolvedValue({
            id: "item-1",
            isRead: false,
            archivedAt: null,
            readingProgress: 0,
            manualPriority: "high",
          }),
        update: jest.fn().mockImplementation(async (_id, patch) => ({ id: "item-1", ...patch })),
      },
    });
    await updateItemState(repositories, "item-1", {
      isRead: true,
      archived: true,
      readingProgress: 0.5,
      manualPriority: "high",
    });
    expect(repositories.items.update).toHaveBeenCalledWith("item-1", {});
    await updateItemState(repositories, "item-1", {
      isRead: false,
      archived: false,
      readingProgress: 1,
      manualPriority: null,
      idempotencyKey: "restore-1",
    });
    expect(repositories.items.update).toHaveBeenLastCalledWith(
      "item-1",
      expect.objectContaining({ isRead: false, archivedAt: undefined, readingProgress: 1 })
    );
    expect(repositories.itemEvents.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "restored" })
    );
    await updateItemState(repositories, "item-1", { readingProgress: 1 });
    expect(repositories.itemEvents.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "completed" })
    );
  });

  it("uses 404 for missing items", async () => {
    const repositories = repositorySet({
      items: { findById: jest.fn().mockResolvedValue(undefined) },
    });
    await expect(
      updateItemState(repositories, "missing", parseBody({ isRead: true }, stateSchema))
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND", status: 404 });
  });

  it("supports note lifecycle and preserves note creation time", async () => {
    const existing = { itemId: "item-1", body: "old", createdAt: "old", updatedAt: "old" };
    const repositories = fullRepositorySet({
      itemNotes: {
        find: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockImplementation(async (note) => note),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    });
    await expect(getNote(repositories, "item-1")).resolves.toBe(existing);
    await expect(putNote(repositories, "item-1", "new")).resolves.toMatchObject({
      body: "new",
      createdAt: "old",
    });
    await expect(deleteNote(repositories, "item-1")).resolves.toBeUndefined();
    expect(repositories.itemNotes.delete).toHaveBeenCalledWith("item-1");
  });

  it("creates idempotent annotations, updates anchors, and handles conflicts", async () => {
    const input = {
      selectedQuote: "quote",
      prefix: "before",
      suffix: "after",
      contentHash: "hash",
      contentVersion: "version",
      comment: "note",
      startOffset: 1,
      endOffset: 6,
      idempotencyKey: "annotation-1",
    };
    const repositories = fullRepositorySet();
    const created = await createAnnotation(repositories, "item-1", input);
    expect(created).toMatchObject({ itemId: "item-1", selectedQuote: "quote", status: "active" });
    jest.mocked(repositories.annotations.listForItem).mockResolvedValue([created]);
    const same = await createAnnotation(repositories, "item-1", input);
    expect(same).toEqual(created);
    const updated = await updateAnnotation(repositories, "item-1", created.id, {
      selectedQuote: "new quote",
      prefix: "",
      suffix: "",
      contentHash: "new hash",
      contentVersion: "new version",
      comment: null,
      status: "orphaned",
      startOffset: null,
      endOffset: null,
    });
    expect(updated).toMatchObject({ selectedQuote: "new quote", status: "orphaned" });
    await expect(deleteAnnotation(repositories, "item-1", created.id)).resolves.toBeUndefined();
  });

  it("returns annotation conflicts and missing-resource errors", async () => {
    const repositories = fullRepositorySet({
      annotations: {
        listForItem: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue(new Error("unique")),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(false),
      },
    });
    await expect(
      createAnnotation(repositories, "item-1", {
        selectedQuote: "quote",
        prefix: "",
        suffix: "",
        contentHash: "hash",
        contentVersion: "version",
      })
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      updateAnnotation(repositories, "item-1", "missing", { status: "active" })
    ).rejects.toMatchObject({
      code: "ANNOTATION_NOT_FOUND",
      status: 404,
    });
  });

  it("changes only the requested annotation field and leaves every omitted anchor field intact", async () => {
    const annotation = {
      id: "annotation-1",
      itemId: "item-1",
      selectedQuote: "quote",
      prefix: "before",
      suffix: "after",
      contentHash: "hash",
      contentVersion: "version",
      status: "active" as const,
    };
    const repositories = fullRepositorySet({
      annotations: {
        listForItem: jest.fn().mockResolvedValue([annotation]),
        update: jest
          .fn()
          .mockImplementation(async (id, patch) => ({ ...annotation, id, ...patch })),
      },
    });

    await expect(
      updateAnnotation(repositories, "item-1", annotation.id, { status: "orphaned" })
    ).resolves.toMatchObject({ status: "orphaned" });
    expect(repositories.annotations.update).toHaveBeenCalledWith(
      annotation.id,
      expect.objectContaining({ status: "orphaned" })
    );
    const patch = jest.mocked(repositories.annotations.update).mock.calls[0]?.[1] ?? {};
    expect(patch).not.toEqual(
      expect.objectContaining({
        selectedQuote: expect.anything(),
        prefix: expect.anything(),
        suffix: expect.anything(),
        contentHash: expect.anything(),
        contentVersion: expect.anything(),
      })
    );
  });

  it("supports collection lifecycle and membership event semantics", async () => {
    const repositories = fullRepositorySet();
    await expect(listCollections(repositories)).resolves.toEqual([]);
    const collection = await createCollection(repositories, {
      name: "Reading",
      idempotencyKey: "c-1",
    });
    expect(collection).toMatchObject({ name: "Reading" });
    await expect(
      createCollection(repositories, { name: "Reading", idempotencyKey: "c-1" })
    ).resolves.toEqual(collection);
    await expect(getCollection(repositories, "collection-1")).resolves.toMatchObject({
      collection: { id: "collection-1" },
      items: [],
    });
    await expect(
      updateCollection(repositories, "collection-1", { name: "Updated", description: null })
    ).resolves.toMatchObject({
      name: "Updated",
      description: undefined,
    });
    await expect(deleteCollection(repositories, "collection-1")).resolves.toBeUndefined();

    const membership = await addCollectionItem(repositories, "collection-1", "item-1", 3);
    expect(membership).toMatchObject({
      collectionId: "collection-1",
      itemId: "item-1",
      position: 3,
    });
    expect(repositories.itemEvents.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "collection_added" })
    );
    await expect(
      removeCollectionItem(repositories, "collection-1", "item-1")
    ).resolves.toBeUndefined();
    expect(repositories.itemEvents.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "collection_removed" })
    );
  });

  it("uses existing membership position and makes missing collection operations explicit", async () => {
    const repositories = fullRepositorySet({
      collections: {
        find: jest.fn().mockResolvedValue({ id: "collection-1" }),
        listItems: jest.fn().mockResolvedValue([{ itemId: "item-1", position: 8, addedAt: "old" }]),
        addItem: jest.fn().mockImplementation(async (membership) => membership),
        removeItem: jest.fn().mockResolvedValue(false),
      },
    });
    await expect(addCollectionItem(repositories, "collection-1", "item-1")).resolves.toMatchObject({
      position: 8,
      addedAt: "old",
    });
    const missingCollection = fullRepositorySet({
      collections: { find: jest.fn().mockResolvedValue(undefined) },
    });
    await expect(
      removeCollectionItem(missingCollection, "missing", "item-1")
    ).rejects.toMatchObject({
      code: "COLLECTION_NOT_FOUND",
      status: 404,
    });
  });
});
