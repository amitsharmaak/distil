import { createHash } from "node:crypto";

import { AuthError } from "@/lib/auth/errors";
import type { RepositorySet } from "@/lib/repositories/ports";
import {
  addCollectionItem,
  annotationCreateSchema,
  annotationUpdateSchema,
  collectionCreateSchema,
  createAnnotation,
  createCollection,
  membershipSchema,
  noteSchema,
  parseBody,
  ReaderError,
  stateSchema,
} from "@/lib/phase2/reader-service";

jest.mock("@/lib/auth/route-helpers", () => ({
  requireRequestSession: jest.fn(),
  requireSessionMutation: jest.fn(),
}));
jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));
jest.mock("@/lib/postgres/client", () => ({ createPostgresClient: jest.fn() }));
jest.mock("@/lib/feed/feed-query", () => {
  class FeedQueryError extends Error {
    readonly code = "INVALID_CURSOR" as const;

    constructor(message: string) {
      super(message);
      this.name = "FeedQueryError";
    }
  }
  return { FeedQueryError, PostgresFeedQuery: jest.fn() };
});

import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { createPostgresClient } from "@/lib/postgres/client";
import { FeedQueryError, PostgresFeedQuery } from "@/lib/feed/feed-query";
import { GET as getFeed } from "@/app/api/v1/feed/route";
import { POST as createCollectionRoute } from "@/app/api/v1/collections/route";
import { GET as listCollectionsRoute } from "@/app/api/v1/collections/route";
import {
  DELETE as deleteCollectionRoute,
  GET as getCollectionRoute,
  PATCH as patchCollectionRoute,
} from "@/app/api/v1/collections/[id]/route";
import { DELETE as deleteMembership } from "@/app/api/v1/collections/[id]/items/[itemId]/route";
import { PUT as putNote } from "@/app/api/v1/items/[id]/note/route";
import { PATCH as patchState } from "@/app/api/v1/items/[id]/state/route";
import {
  GET as listAnnotationsRoute,
  POST as createAnnotationRoute,
} from "@/app/api/v1/items/[id]/annotations/route";
import {
  DELETE as deleteAnnotationRoute,
  PATCH as patchAnnotationRoute,
} from "@/app/api/v1/items/[id]/annotations/[annotationId]/route";
import { PUT as putMembership } from "@/app/api/v1/collections/[id]/items/[itemId]/route";

const mockSession = requireRequestSession as jest.MockedFunction<typeof requireRequestSession>;
const mockMutation = requireSessionMutation as jest.MockedFunction<typeof requireSessionMutation>;
const mockRepositories = getRepositorySet as jest.MockedFunction<typeof getRepositorySet>;
const mockClient = createPostgresClient as jest.MockedFunction<typeof createPostgresClient>;
const mockFeedQuery = PostgresFeedQuery as jest.MockedClass<typeof PostgresFeedQuery>;

const item = {
  id: "item-1",
  title: "Article",
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

function repositories() {
  return {
    items: {
      findById: jest.fn().mockResolvedValue(item),
      update: jest.fn().mockResolvedValue(item),
    },
    itemEvents: { append: jest.fn().mockResolvedValue(undefined) },
    itemNotes: {
      find: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    annotations: {
      listForItem: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    collections: {
      list: jest.fn().mockResolvedValue([]),
      find: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      listItems: jest.fn().mockResolvedValue([]),
    },
  };
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  mockSession.mockResolvedValue(undefined);
  mockMutation.mockResolvedValue(undefined);
  mockRepositories.mockResolvedValue(repositories() as unknown as RepositorySet);
  mockClient.mockReturnValue({ end: jest.fn().mockResolvedValue(undefined) } as never);
  mockFeedQuery.mockImplementation(
    () => ({ list: jest.fn().mockResolvedValue({ items: [] }) }) as never
  );
});

afterAll(() => {
  delete process.env.DATABASE_URL;
});

describe("Phase 2 reader API contract and security boundaries", () => {
  it("does not open storage when the session is missing", async () => {
    mockSession.mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "no session"));
    const response = await getFeed(new Request("https://distil.example/api/v1/feed"));
    expect(response.status).toBe(401);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("rejects cross-origin writes before parsing or opening repositories", async () => {
    mockMutation.mockRejectedValue(new AuthError("ORIGIN_NOT_ALLOWED", 403, "blocked"));
    const calls = [
      putNote(jsonRequest("http://localhost/api/v1/items/item-1/note", "PUT", { body: "note" }), {
        params: Promise.resolve({ id: "item-1" }),
      }),
      createAnnotationRoute(
        jsonRequest("http://localhost/api/v1/items/item-1/annotations", "POST", {
          selectedQuote: "quote",
          contentHash: "hash",
          contentVersion: "v1",
        }),
        { params: Promise.resolve({ id: "item-1" }) }
      ),
      createCollectionRoute(
        jsonRequest("http://localhost/api/v1/collections", "POST", { name: "Inbox" })
      ),
      patchState(
        jsonRequest("http://localhost/api/v1/items/item-1/state", "PATCH", { isRead: true }),
        { params: Promise.resolve({ id: "item-1" }) }
      ),
      putMembership(jsonRequest("http://localhost/api/v1/collections/c/items/i", "PUT", {}), {
        params: Promise.resolve({ id: "c", itemId: "i" }),
      }),
    ];
    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: { code: "ORIGIN_NOT_ALLOWED", message: "blocked" },
      });
    }
    expect(mockRepositories).not.toHaveBeenCalled();
  });

  it("rejects unknown fields, invalid numbers, and oversized text strictly", () => {
    expect(() => parseBody({ isRead: true, extra: true }, stateSchema)).toThrow(ReaderError);
    expect(() => parseBody({ position: -1 }, membershipSchema)).toThrow(ReaderError);
    expect(() => parseBody({ body: "x".repeat(100_001) }, noteSchema)).toThrow(ReaderError);
    expect(() =>
      parseBody(
        { selectedQuote: "q", contentHash: "h", contentVersion: "v", extra: true },
        annotationCreateSchema
      )
    ).toThrow(ReaderError);
    expect(() =>
      parseBody(
        { selectedQuote: "x".repeat(20_001), contentHash: "h", contentVersion: "v" },
        annotationCreateSchema
      )
    ).toThrow(ReaderError);
    expect(() => parseBody({ name: "n".repeat(201) }, collectionCreateSchema)).toThrow(ReaderError);
    expect(() => parseBody({ name: "Inbox", unknown: true }, collectionCreateSchema)).toThrow(
      ReaderError
    );
  });

  it("rejects malformed dates, offsets, limits, and cursors without querying", async () => {
    for (const query of [
      "?dateFrom=not-a-date",
      "?dateFrom=2026-09-08T00:00:00.000Z&dateTo=2026-09-07T00:00:00.000Z",
      "?limit=0",
      "?limit=101",
    ]) {
      const response = await getFeed(new Request(`https://distil.example/api/v1/feed${query}`));
      expect(response.status).toBe(400);
    }
    expect(mockClient).not.toHaveBeenCalled();

    expect(() => parseBody({ startOffset: 2, endOffset: null }, annotationUpdateSchema)).toThrow(
      ReaderError
    );
    expect(() => parseBody({ startOffset: null, endOffset: 3 }, annotationUpdateSchema)).toThrow(
      ReaderError
    );
  });

  it("keeps the feed default archive policy and maps invalid cursors to 400", async () => {
    const list = jest.fn().mockResolvedValue({ items: [], nextCursor: undefined });
    mockFeedQuery.mockImplementation(() => ({ list }) as never);
    await getFeed(new Request("https://distil.example/api/v1/feed?sort=recent"));
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ archive: undefined, sort: "recent" })
    );

    list.mockRejectedValueOnce(new FeedQueryError("INVALID_CURSOR", "cursor is invalid"));
    const response = await getFeed(
      new Request("https://distil.example/api/v1/feed?cursor=not-a-cursor")
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_CURSOR" } });
  });

  it("does not expose SQL or content details in conflict and 500 responses", async () => {
    const repo = repositories();
    repo.items.findById.mockRejectedValueOnce(
      new Error('SELECT body FROM item_notes; secret="abc"')
    );
    mockRepositories.mockResolvedValue(repo as unknown as RepositorySet);
    const serverError = await putNote(
      jsonRequest("http://localhost/api/v1/items/item-1/note", "PUT", { body: "note" }),
      { params: Promise.resolve({ id: "item-1" }) }
    );
    expect(serverError.status).toBe(500);
    const serverErrorBody = await serverError.text();
    expect(serverErrorBody).not.toContain("secret");
    expect(serverErrorBody).not.toContain("SELECT");

    repo.annotations.create.mockRejectedValueOnce(
      new Error("duplicate key; selected_quote=private")
    );
    repo.annotations.listForItem.mockResolvedValueOnce([]);
    const conflict = await createAnnotation(
      repo as unknown as RepositorySet,
      "item-1",
      parseBody(
        { selectedQuote: "quote", contentHash: "h", contentVersion: "v" },
        annotationCreateSchema
      )
    ).catch((error: unknown) => error);
    expect(conflict).toMatchObject({ code: "CONFLICT", status: 409 });
    expect((conflict as Error).message).toBe("Annotation already exists");

    repo.collections.find.mockResolvedValueOnce(undefined);
    repo.collections.create.mockRejectedValueOnce(new Error("duplicate key; name=private"));
    const collectionConflict = await createCollection(
      repo as unknown as RepositorySet,
      parseBody({ name: "Inbox" }, collectionCreateSchema)
    ).catch((error: unknown) => error);
    expect(collectionConflict).toMatchObject({ code: "CONFLICT", status: 409 });
    expect((collectionConflict as Error).message).toBe("Collection already exists");
  });

  it("makes idempotent collection membership retries preserve the original position", async () => {
    const repo = repositories();
    repo.collections.find.mockResolvedValue({ id: "collection-1", name: "Inbox" });
    repo.collections.listItems.mockResolvedValue([
      {
        collectionId: "collection-1",
        itemId: "item-1",
        position: 7,
        addedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    repo.collections.addItem.mockImplementation(async (record: unknown) => record);
    const result = await addCollectionItem(
      repo as unknown as RepositorySet,
      "collection-1",
      "item-1"
    );
    expect(result.position).toBe(7);
    expect(repo.collections.addItem).toHaveBeenCalledWith(expect.objectContaining({ position: 7 }));
  });

  it("makes idempotent collection and annotation creation retries return existing records", async () => {
    const repo = repositories();
    const collection = { id: "collection-hash", name: "Inbox" };
    repo.collections.find.mockResolvedValue(collection);
    await expect(
      createCollection(repo as unknown as RepositorySet, {
        name: "Different retry payload",
        idempotencyKey: "same-key",
      })
    ).resolves.toBe(collection);
    expect(repo.collections.create).not.toHaveBeenCalled();

    const annotation = {
      id: `annotation-${createHash("sha256").update("item-1:same-key").digest("hex").slice(0, 40)}`,
      itemId: "item-1",
    };
    repo.annotations.listForItem.mockResolvedValue([annotation]);
    await expect(
      createAnnotation(
        repo as unknown as RepositorySet,
        "item-1",
        parseBody(
          {
            selectedQuote: "quote",
            contentHash: "h",
            contentVersion: "v",
            idempotencyKey: "same-key",
          },
          annotationCreateSchema
        )
      )
    ).resolves.toBe(annotation);
    expect(repo.annotations.create).not.toHaveBeenCalled();
  });

  it("covers authenticated annotation and collection read/mutation routes", async () => {
    const repo = repositories();
    const annotation = {
      id: "annotation-1",
      itemId: "item-1",
      selectedQuote: "quote",
      prefix: "",
      suffix: "",
      contentHash: "hash",
      contentVersion: "v1",
      status: "active" as const,
    };
    repo.annotations.listForItem.mockResolvedValue([annotation]);
    repo.annotations.update.mockResolvedValue(annotation);
    repo.annotations.delete.mockResolvedValue(true);
    repo.collections.list.mockResolvedValue([{ id: "collection-1", name: "Inbox" }]);
    repo.collections.find.mockResolvedValue({ id: "collection-1", name: "Inbox" });
    repo.collections.listItems.mockResolvedValue([]);
    repo.collections.update.mockResolvedValue({ id: "collection-1", name: "Updated" });
    repo.collections.delete.mockResolvedValue(true);
    mockRepositories.mockResolvedValue(repo as unknown as RepositorySet);

    const annotationList = await listAnnotationsRoute(new Request("http://localhost"), {
      params: Promise.resolve({ id: "item-1" }),
    });
    expect(annotationList.status).toBe(200);
    await expect(annotationList.json()).resolves.toEqual({ annotations: [annotation] });

    const annotationPatch = await patchAnnotationRoute(
      jsonRequest("http://localhost", "PATCH", { comment: "Remember" }),
      { params: Promise.resolve({ id: "item-1", annotationId: "annotation-1" }) }
    );
    expect(annotationPatch.status).toBe(200);
    const annotationDelete = await deleteAnnotationRoute(new Request("http://localhost"), {
      params: Promise.resolve({ id: "item-1", annotationId: "annotation-1" }),
    });
    expect(annotationDelete.status).toBe(204);

    const collectionList = await listCollectionsRoute(new Request("http://localhost"));
    expect(collectionList.status).toBe(200);
    const collectionGet = await getCollectionRoute(new Request("http://localhost"), {
      params: Promise.resolve({ id: "collection-1" }),
    });
    expect(collectionGet.status).toBe(200);
    const collectionPatch = await patchCollectionRoute(
      jsonRequest("http://localhost", "PATCH", { name: "Updated" }),
      { params: Promise.resolve({ id: "collection-1" }) }
    );
    expect(collectionPatch.status).toBe(200);
    const collectionDelete = await deleteCollectionRoute(new Request("http://localhost"), {
      params: Promise.resolve({ id: "collection-1" }),
    });
    expect(collectionDelete.status).toBe(204);

    repo.collections.removeItem.mockResolvedValue(true);
    const membershipDelete = await deleteMembership(new Request("http://localhost"), {
      params: Promise.resolve({ id: "collection-1", itemId: "item-1" }),
    });
    expect(membershipDelete.status).toBe(204);
  });
});
