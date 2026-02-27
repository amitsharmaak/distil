/**
 * Unit tests for src/lib/db.ts — SQLite database module.
 *
 * Tests run against an in-memory SQLite database (DB_PATH=":memory:") so they
 * never touch the real data/pia.db file and are fully isolated from each other.
 *
 * Because db.ts uses a module-level singleton, we reset it between tests by
 * deleting all rows after each test (rather than re-importing the module).
 */

// Use an in-memory DB for tests so they never touch the real data/pia.db file.
process.env.DB_PATH = ":memory:";

// Import AFTER setting the env var so the module picks it up.
import { getItems, getItemById, insertItem, updateItem, deleteItem, db } from "../db";
import type { ContentItem } from "../types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal valid ContentItem for test insertion. */
function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: `test-${Date.now()}-${Math.random()}`,
    title: "Test Article",
    summary: "A test summary.",
    sourceType: "manual",
    contentType: "article",
    topics: ["Test"],
    url: "https://example.com",
    priority: "medium",
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

// Clear all rows before each test so tests are isolated.
// The schema and seeded mock data are already in place from module load.
beforeEach(() => {
  db.exec("DELETE FROM items");
});

// ── getItems ──────────────────────────────────────────────────────────────────

describe("getItems", () => {
  it("returns an empty array when no items exist", () => {
    expect(getItems()).toEqual([]);
  });

  it("returns all inserted items", () => {
    const a = insertItem(makeItem({ id: "a", title: "Alpha" }));
    const b = insertItem(makeItem({ id: "b", title: "Beta" }));

    const items = getItems();
    expect(items).toHaveLength(2);
    // Results are ordered newest first; both IDs must be present.
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(["a", "b"]));
    void a;
    void b;
  });

  it("filters by sourceType", () => {
    insertItem(makeItem({ id: "g", sourceType: "gmail" }));
    insertItem(makeItem({ id: "s", sourceType: "slack" }));

    const results = getItems({ sourceType: "gmail" });
    expect(results).toHaveLength(1);
    expect(results[0].sourceType).toBe("gmail");
  });

  it("filters by contentType", () => {
    insertItem(makeItem({ id: "v", contentType: "video" }));
    insertItem(makeItem({ id: "a", contentType: "article" }));

    const results = getItems({ contentType: "video" });
    expect(results).toHaveLength(1);
    expect(results[0].contentType).toBe("video");
  });

  it("filters by priority", () => {
    insertItem(makeItem({ id: "h", priority: "high" }));
    insertItem(makeItem({ id: "l", priority: "low" }));

    const results = getItems({ priority: "high" });
    expect(results).toHaveLength(1);
    expect(results[0].priority).toBe("high");
  });

  it("filters unread items (isRead: false)", () => {
    insertItem(makeItem({ id: "u", isRead: false }));
    insertItem(makeItem({ id: "r", isRead: true }));

    const results = getItems({ isRead: false });
    expect(results).toHaveLength(1);
    expect(results[0].isRead).toBe(false);
  });

  it("filters read items (isRead: true)", () => {
    insertItem(makeItem({ id: "u", isRead: false }));
    insertItem(makeItem({ id: "r", isRead: true }));

    const results = getItems({ isRead: true });
    expect(results).toHaveLength(1);
    expect(results[0].isRead).toBe(true);
  });

  it("respects limit filter", () => {
    for (let i = 0; i < 5; i++) {
      insertItem(makeItem({ id: `item-${i}` }));
    }

    const results = getItems({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("sorts by priority when sort=priority", () => {
    insertItem(makeItem({ id: "l", priority: "low" }));
    insertItem(makeItem({ id: "h", priority: "high" }));
    insertItem(makeItem({ id: "m", priority: "medium" }));

    const results = getItems({ sort: "priority" });
    expect(results[0].priority).toBe("high");
    expect(results[1].priority).toBe("medium");
    expect(results[2].priority).toBe("low");
  });

  it("correctly deserializes topics array", () => {
    insertItem(makeItem({ id: "t", topics: ["AI", "Tech", "Web"] }));

    const [item] = getItems();
    expect(item.topics).toEqual(["AI", "Tech", "Web"]);
  });
});

// ── getItemById ───────────────────────────────────────────────────────────────

describe("getItemById", () => {
  it("returns the item with the given id", () => {
    const item = insertItem(makeItem({ id: "found", title: "Found It" }));

    const result = getItemById("found");
    expect(result).toBeDefined();
    expect(result!.title).toBe("Found It");
    void item;
  });

  it("returns undefined when the id does not exist", () => {
    expect(getItemById("nonexistent")).toBeUndefined();
  });
});

// ── insertItem ────────────────────────────────────────────────────────────────

describe("insertItem", () => {
  it("inserts and returns the item", () => {
    const toInsert = makeItem({ id: "ins", title: "Inserted" });
    const inserted = insertItem(toInsert);

    expect(inserted.id).toBe("ins");
    expect(inserted.title).toBe("Inserted");
  });

  it("persists optional fields", () => {
    const toInsert = makeItem({
      id: "opt",
      author: "Jane Doe",
      publication: "Tech Blog",
      thumbnailUrl: "https://example.com/img.jpg",
      duration: "5:30",
      fullContent: "Full text here",
    });
    const inserted = insertItem(toInsert);

    expect(inserted.author).toBe("Jane Doe");
    expect(inserted.publication).toBe("Tech Blog");
    expect(inserted.thumbnailUrl).toBe("https://example.com/img.jpg");
    expect(inserted.duration).toBe("5:30");
    expect(inserted.fullContent).toBe("Full text here");
  });

  it("correctly round-trips isRead as boolean", () => {
    const readItem = insertItem(makeItem({ id: "read-true", isRead: true }));
    const unreadItem = insertItem(makeItem({ id: "read-false", isRead: false }));

    expect(readItem.isRead).toBe(true);
    expect(unreadItem.isRead).toBe(false);
  });
});

// ── updateItem ────────────────────────────────────────────────────────────────

describe("updateItem", () => {
  it("updates only the specified fields", () => {
    const item = insertItem(makeItem({ id: "upd", title: "Original", isRead: false }));

    const updated = updateItem("upd", { isRead: true });

    expect(updated).toBeDefined();
    expect(updated!.isRead).toBe(true);
    // Other fields should be unchanged.
    expect(updated!.title).toBe("Original");
    void item;
  });

  it("returns undefined for a non-existent id", () => {
    expect(updateItem("ghost", { isRead: true })).toBeUndefined();
  });

  it("can update priority", () => {
    insertItem(makeItem({ id: "prio", priority: "low" }));

    const updated = updateItem("prio", { priority: "high" });
    expect(updated!.priority).toBe("high");
  });

  it("can update topics array", () => {
    insertItem(makeItem({ id: "topics", topics: ["Old"] }));

    const updated = updateItem("topics", { topics: ["New", "Tags"] });
    expect(updated!.topics).toEqual(["New", "Tags"]);
  });
});

// ── deleteItem ────────────────────────────────────────────────────────────────

describe("deleteItem", () => {
  it("deletes an existing item and returns true", () => {
    insertItem(makeItem({ id: "del" }));

    const deleted = deleteItem("del");
    expect(deleted).toBe(true);
    expect(getItemById("del")).toBeUndefined();
  });

  it("returns false for a non-existent id", () => {
    expect(deleteItem("phantom")).toBe(false);
  });
});
