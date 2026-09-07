import { resolve } from "node:path";

import { PostgresFeedQuery } from "../feed-query";
import { createPostgresRepositories } from "@/lib/postgres/repositories";
import type { ContentItem } from "@/lib/types";
import { PostgresTestHarness } from "../../../../tests/support/postgres";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const item = (id: string, patch: Partial<ContentItem> = {}): ContentItem => ({
  id,
  title: id,
  summary: "summary",
  sourceType: "manual",
  contentType: "article",
  topics: ["engineering"],
  url: `https://example.test/${id}`,
  priority: "medium",
  isRead: false,
  createdAt: "2026-09-06T00:00:00.000Z",
  processingStatus: "ready",
  ...patch,
});

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
});
afterEach(async () => harness.reset());
afterAll(async () => harness.stop());

describe("PostgresFeedQuery", () => {
  it("applies OR within facets, AND across facets, excludes archive by default, and keyset-paginates", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.items.insert(item("match-a", { topics: ["engineering", "ai"], priority: "high" }));
    await repos.items.insert(
      item("match-b", { sourceType: "publisher", topics: ["product"], priority: "high" })
    );
    await repos.items.insert(item("wrong-source", { sourceType: "gmail", priority: "high" }));
    await repos.items.insert(
      item("archived", { priority: "high", archivedAt: "2026-09-06T01:00:00Z" })
    );
    await repos.items.insert(item("read", { priority: "high", isRead: true }));
    await repos.collections.create({
      id: "favourites",
      name: "Favourites",
      createdAt: "2026-09-06T00:00:00Z",
      updatedAt: "2026-09-06T00:00:00Z",
    });
    await repos.collections.addItem({
      collectionId: "favourites",
      itemId: "match-a",
      position: 0,
      addedAt: "2026-09-06T00:00:00Z",
    });
    await repos.collections.addItem({
      collectionId: "favourites",
      itemId: "match-b",
      position: 1,
      addedAt: "2026-09-06T00:00:00Z",
    });

    const feed = new PostgresFeedQuery(harness.sql);
    const first = await feed.list({
      sources: ["manual", "publisher"],
      topics: ["ai", "product"],
      priorities: ["high"],
      collectionIds: ["favourites"],
      read: false,
      sort: "priority",
      limit: 1,
      now: new Date("2026-09-07T00:00:00Z"),
    });
    expect(first.items).toHaveLength(1);
    expect(first.items[0].id).toBe("match-a");
    expect(first.items[0].rank.reasons).toContain("Item priority: high");
    expect(first.nextCursor).toBeTruthy();

    const second = await feed.list({
      sources: ["manual", "publisher"],
      topics: ["ai", "product"],
      priorities: ["high"],
      collectionIds: ["favourites"],
      read: false,
      sort: "priority",
      limit: 1,
      cursor: first.nextCursor,
      now: new Date("2026-09-07T00:00:00Z"),
    });
    expect(second.items.map((entry) => entry.id)).toEqual(["match-b"]);
  });

  it("honors manual priority and supports chronological and archive escape hatches", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.items.insert(item("manual-low", { manualPriority: "low", priority: "low" }));
    await repos.items.insert(item("learned-high", { priority: "high" }));
    await repos.items.insert(
      item("old", { createdAt: "2026-09-01T00:00:00Z", archivedAt: "2026-09-02T00:00:00Z" })
    );
    const feed = new PostgresFeedQuery(harness.sql);
    expect(
      (await feed.list({ sort: "for_you", now: new Date("2026-09-07T00:00:00Z") })).items.map(
        (entry) => entry.id
      )
    ).toEqual(["manual-low", "learned-high"]);
    expect(
      (await feed.list({ sort: "recent" })).items.map((entry) => entry.rank.reasons[0])
    ).toEqual(["Chronological order", "Chronological order"]);
    expect(
      (await feed.list({ archive: "only", sort: "recent" })).items.map((entry) => entry.id)
    ).toEqual(["old"]);
  });
});
