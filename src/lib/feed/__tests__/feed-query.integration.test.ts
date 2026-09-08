import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgresFeedQuery } from "../feed-query";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { applyTenantMigrationStage } from "@/lib/postgres/tenant-migration/migrator";
import { buildTenantMigrationReport } from "@/lib/postgres/tenant-migration/verifier";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});
import { createPostgresRepositories } from "@/lib/postgres/repositories";
import type { ContentItem } from "@/lib/types";
import { PostgresTestHarness } from "../../../../tests/support/postgres";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");
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
  await harness.sql.unsafe("DROP TABLE __distil_test_migrations");
  await harness.sql.unsafe(await readFile(rolesSql, "utf8"));
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "expand",
    ownerId: context.userId,
    migrationsDirectory: tenantMigrations,
  });
  const baseline = await buildTenantMigrationReport({
    client: harness.sql,
    stage: "before",
    ownerId: context.userId,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "backfill",
    ownerId: context.userId,
    migrationsDirectory: tenantMigrations,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "contract",
    ownerId: context.userId,
    migrationsDirectory: tenantMigrations,
    baseline,
  });
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`
    INSERT INTO users (id, status) VALUES (${context.userId}::uuid, 'active')
  `;
});
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

    const feed = new PostgresFeedQuery(harness.sql, context);
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
    expect(first.items[0].id).toBe("match-b");
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
    expect(second.items.map((entry) => entry.id)).toEqual(["match-a"]);
  });

  it("honors manual priority and supports chronological and archive escape hatches", async () => {
    const repos = createPostgresRepositories(harness.sql);
    await repos.items.insert(item("manual-low", { manualPriority: "low", priority: "low" }));
    await repos.items.insert(item("learned-high", { priority: "high" }));
    await repos.items.insert(
      item("old", { createdAt: "2026-09-01T00:00:00Z", archivedAt: "2026-09-02T00:00:00Z" })
    );
    const feed = new PostgresFeedQuery(harness.sql, context);
    expect(
      (await feed.list({ sort: "for_you", now: new Date("2026-09-07T00:00:00Z") })).items.map(
        (entry) => entry.id
      )
    ).toEqual(["learned-high", "manual-low"]);
    expect(
      (await feed.list({ sort: "recent" })).items.map((entry) => entry.rank.reasons[0])
    ).toEqual(["Chronological order", "Chronological order"]);
    expect(
      (await feed.list({ archive: "only", sort: "recent" })).items.map((entry) => entry.id)
    ).toEqual(["old"]);
  });
});
