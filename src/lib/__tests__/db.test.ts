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
  // Generate a unique id and url so URL-based deduplication never collapses
  // two distinct test items into one.
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `test-${uid}`,
    title: "Test Article",
    summary: "A test summary.",
    sourceType: "manual",
    contentType: "article",
    topics: ["Test"],
    url: `https://example.com/${uid}`,
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

// ── FTS5 full-text search ─────────────────────────────────────────────────────

describe("getItems — FTS5 full-text search", () => {
  it("returns item matching a title keyword", () => {
    insertItem(makeItem({ id: "fts-title", title: "Quantum Computing Advances" }));
    insertItem(makeItem({ id: "fts-other", title: "Cooking Recipes" }));

    const results = getItems({ query: "Quantum" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fts-title");
  });

  it("returns item matching a summary keyword", () => {
    insertItem(
      makeItem({
        id: "fts-summary",
        title: "Generic Title",
        summary: "This article covers photosynthesis in detail.",
      }),
    );
    insertItem(makeItem({ id: "fts-other2", title: "Another Article", summary: "Nothing relevant." }));

    const results = getItems({ query: "photosynthesis" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fts-summary");
  });

  it("returns item matching a topics keyword", () => {
    // topics is stored as JSON string: '["AI","Tech"]'
    insertItem(
      makeItem({
        id: "fts-topics",
        title: "Some Title",
        topics: ["MachineLearning", "Tech"],
      }),
    );
    insertItem(
      makeItem({
        id: "fts-topics-other",
        title: "Other Title",
        topics: ["Cooking", "Food"],
      }),
    );

    const results = getItems({ query: "MachineLearning" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fts-topics");
  });

  it("returns empty array when no items match the query", () => {
    insertItem(makeItem({ id: "fts-nomatch", title: "Completely Irrelevant Content" }));

    const results = getItems({ query: "xyznonexistentterm" });
    expect(results).toHaveLength(0);
  });

  it("FTS operator keyword alone (NOT) does not throw and returns all items", () => {
    insertItem(makeItem({ id: "fts-op1", title: "First Article" }));
    insertItem(makeItem({ id: "fts-op2", title: "Second Article" }));

    // 'NOT' alone sanitizes to empty string → falls back to non-FTS path
    expect(() => getItems({ query: "NOT" })).not.toThrow();
    const results = getItems({ query: "NOT" });
    expect(results).toHaveLength(2);
  });

  it("FTS operator keyword alone (OR) does not throw and returns all items", () => {
    insertItem(makeItem({ id: "fts-or1", title: "Alpha Article" }));

    expect(() => getItems({ query: "OR" })).not.toThrow();
    const results = getItems({ query: "OR" });
    expect(results).toHaveLength(1);
  });

  it("empty query string returns all items without FTS", () => {
    insertItem(makeItem({ id: "fts-empty1", title: "Item One" }));
    insertItem(makeItem({ id: "fts-empty2", title: "Item Two" }));

    const results = getItems({ query: "" });
    expect(results).toHaveLength(2);
  });

  it("multi-word query matches items containing ALL tokens", () => {
    insertItem(
      makeItem({
        id: "fts-multi-match",
        title: "Machine Learning basics",
        summary: "An intro to machine learning techniques.",
      }),
    );
    insertItem(
      makeItem({
        id: "fts-multi-nomatch",
        title: "Machine tools for woodworking",
        summary: "Using machine tools.",
      }),
    );

    // Both tokens 'machine*' and 'learning*' must be present
    const results = getItems({ query: "machine learning" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fts-multi-match");
  });

  it("FTS query combined with sourceType filter returns only matching items", () => {
    insertItem(
      makeItem({
        id: "fts-combined-gmail",
        title: "Blockchain Revolution",
        sourceType: "gmail",
      }),
    );
    insertItem(
      makeItem({
        id: "fts-combined-slack",
        title: "Blockchain Update",
        sourceType: "slack",
      }),
    );

    const results = getItems({ query: "Blockchain", sourceType: "gmail" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fts-combined-gmail");
    expect(results[0].sourceType).toBe("gmail");
  });
});
