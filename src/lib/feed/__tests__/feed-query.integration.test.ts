import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createAuthContext } from "@/lib/contracts/tenant-context";
import { applyTenantMigrationStage } from "@/lib/postgres/tenant-migration/migrator";
import { buildTenantMigrationReport } from "@/lib/postgres/tenant-migration/verifier";
import { createPostgresRepositoryAccess } from "@/lib/postgres/tenant-repositories";
import { explainFeedRank } from "@/lib/feed/feed-query";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});
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
  // feed-search (0012) adds the columns search and the site facet read; the later stages keep
  // this suite on the full current schema.
  for (const stage of [
    "lifecycle",
    "returning-auth",
    "perf-indexes",
    "summary-structure",
    "feed-search",
    "life-areas",
  ] as const) {
    await applyTenantMigrationStage({
      sql: harness.sql,
      stage,
      ownerId: context.userId,
      migrationsDirectory: tenantMigrations,
    });
  }
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
    const repos = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    await repos.items.insert(item("match-a", { topics: ["engineering", "ai"], priority: "high" }));
    await repos.items.insert(
      item("match-b", { sourceType: "publisher", topics: ["product"], priority: "high" })
    );
    await repos.items.insert(item("wrong-source", { sourceType: "gmail", priority: "high" }));
    await repos.items.insert(
      item("archived", { priority: "high", archivedAt: "2026-09-06T01:00:00Z" })
    );
    await repos.items.insert(item("read", { priority: "high", isRead: true }));
    const feed = repos.feed;
    const first = await feed.list({
      sources: ["manual", "publisher"],
      topics: ["ai", "product"],
      priorities: ["high"],
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
      read: false,
      sort: "priority",
      limit: 1,
      cursor: first.nextCursor,
      now: new Date("2026-09-07T00:00:00Z"),
    });
    expect(second.items.map((entry) => entry.id)).toEqual(["match-a"]);
  });

  it("honors manual priority and supports chronological and archive escape hatches", async () => {
    const repos = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    await repos.items.insert(item("manual-low", { manualPriority: "low", priority: "low" }));
    await repos.items.insert(item("learned-high", { priority: "high" }));
    await repos.items.insert(
      item("old", { createdAt: "2026-09-01T00:00:00Z", archivedAt: "2026-09-02T00:00:00Z" })
    );
    const feed = repos.feed;
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

  it("ranks explicit-signal affinity through the LATERAL join exactly like the rank explanation", async () => {
    const now = new Date("2026-09-07T00:00:00Z");
    const repositories = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    await repositories.items.insert(
      item("signal-manual", { sourceType: "manual", topics: ["ops"] })
    );
    await repositories.items.insert(item("same-source", { sourceType: "manual", topics: ["ops"] }));
    await repositories.items.insert(
      item("other-source", { sourceType: "slack", contentType: "video", topics: ["art"] })
    );
    await repositories.itemEvents.append({
      id: "40000000-0000-4000-8000-000000000001",
      eventKey: "completed:signal-manual",
      itemId: "signal-manual",
      eventType: "completed",
      metadata: {},
      occurredAt: "2026-09-06T00:00:00.000Z",
    });
    const feed = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context).feed;
    const page = await feed.list({ sort: "for_you", personalizationEnabled: true, now });
    const byId = new Map(page.items.map((row) => [row.id, row.rank]));
    // One 'completed' signal one day old: 3 * 2^(-1/60) for every item sharing its source,
    // content type or a topic (including the signal item itself); nothing for the item that
    // shares none of them.
    const expected = Number((3 * Math.exp((-Math.LN2 * 1) / 60)).toFixed(6));
    expect(byId.get("same-source")?.components.affinityScore).toBeCloseTo(expected, 5);
    expect(byId.get("signal-manual")?.components.affinityScore).toBeCloseTo(expected, 5);
    expect(byId.get("other-source")?.components.affinityScore).toBe(0);
    expect(page.items.map((row) => row.id).indexOf("other-source")).toBe(2);
    for (const row of page.items) {
      const explained = explainFeedRank(
        { ...row, affinityScore: row.rank.components.affinityScore },
        "for_you",
        now
      );
      expect(row.rank.score).toBeCloseTo(explained.score, 5);
    }
  });

  it("searches as you type, ranks title matches first, and composes with other filters", async () => {
    const repos = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    await repos.items.insert(
      item("title-hit", { title: "Machine learning in production", summary: "Ops notes" })
    );
    await repos.items.insert(
      item("summary-hit", { title: "Weekly roundup", summary: "A note on machine learning" })
    );
    await repos.items.insert(
      item("topic-hit", { title: "Untitled", summary: "", topics: ["Learning"] })
    );
    await repos.items.insert(
      item("author-hit", { title: "Essay", summary: "", author: "Grace Hopper", topics: [] })
    );
    await repos.items.insert(
      item("video-hit", {
        title: "Learning to cook",
        contentType: "video",
        url: "https://www.youtube.com/watch?v=1",
      })
    );
    await repos.items.insert(item("miss", { title: "Gardening", summary: "Tomatoes" }));
    const feed = repos.feed;
    const ids = async (query: Parameters<typeof feed.list>[0]) =>
      (await feed.list(query)).items.map((entry) => entry.id);

    // A half-typed word matches through the prefix term, and the title outranks the summary.
    expect(await ids({ search: "machine lear", sort: "relevance" })).toEqual([
      "title-hit",
      "summary-hit",
    ]);
    // Stemming: "learning" is stored as "learn"; the topic and every learning item match.
    expect((await ids({ search: "learning", sort: "relevance" })).sort()).toEqual(
      ["summary-hit", "title-hit", "topic-hit", "video-hit"].sort()
    );
    // Past the stem ("learni") only the literal title substring can match.
    expect((await ids({ search: "learni", sort: "relevance" })).sort()).toEqual(
      ["title-hit", "video-hit"].sort()
    );
    expect(await ids({ search: "hopper", sort: "relevance" })).toEqual(["author-hit"]);
    expect(await ids({ search: "learning", contentTypes: ["video"], sort: "recent" })).toEqual([
      "video-hit",
    ]);
    expect(await ids({ search: "the", sort: "relevance" })).toEqual([]);
    expect(await ids({ search: "100%", sort: "relevance" })).toEqual([]);
  });

  it("filters by effective area, letting Amit's correction override the AI", async () => {
    const repos = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    await repos.items.insert(item("ai-work"));
    await repos.items.insert(item("corrected-to-personal"));
    await repos.items.insert(item("unclassified"));
    const classification = {
      confidence: 0.9,
      reason: "r",
      model: "m",
      classifiedAt: "2026-09-29T00:00:00.000Z",
    };
    await repos.items.setAiArea("ai-work", { ...classification, area: "work" });
    await repos.items.setAiArea("corrected-to-personal", { ...classification, area: "work" });
    await harness.sql`
      UPDATE public.items SET manual_area='personal', manual_area_at=now()
      WHERE id='corrected-to-personal'`;
    const ids = async (areas: ("work" | "personal" | "learning" | "updates")[]) =>
      (await repos.feed.list({ areas, sort: "recent" })).items.map((entry) => entry.id).sort();

    expect(await ids(["work"])).toEqual(["ai-work"]);
    expect(await ids(["personal"])).toEqual(["corrected-to-personal"]);
    expect(await ids(["work", "personal"])).toEqual(["ai-work", "corrected-to-personal"]);
    expect(await ids(["learning"])).toEqual([]);
    expect((await repos.feed.list({ sort: "recent" })).items).toHaveLength(3);
  });

  it("filters by site, folding twitter.com into x.com", async () => {
    const repos = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    await repos.items.insert(item("x-post", { url: "https://x.com/someone/status/1" }));
    await repos.items.insert(item("tweet", { url: "https://mobile.twitter.com/someone/status/2" }));
    await repos.items.insert(item("video", { url: "https://www.YouTube.com/watch?v=3" }));
    await repos.items.insert(item("article", { url: "https://example.test/article" }));
    const feed = repos.feed;
    const ids = async (sites: string[]) =>
      (await feed.list({ sites, sort: "recent" })).items.map((entry) => entry.id).sort();

    expect(await ids(["x.com"])).toEqual(["tweet", "x-post"]);
    expect(await ids(["twitter.com"])).toEqual(["tweet", "x-post"]);
    expect(await ids(["youtube.com", "x.com"])).toEqual(["tweet", "video", "x-post"]);
  });

  it("keyset-paginates a relevance-ordered search without skipping or repeating", async () => {
    const repos = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    for (let index = 0; index < 5; index += 1) {
      await repos.items.insert(
        item(`rust-${index}`, {
          title: index % 2 ? "Rust" : "Notes",
          summary: "rust ownership",
          createdAt: `2026-09-0${index + 1}T00:00:00.000Z`,
        })
      );
    }
    const feed = repos.feed;
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await feed.list({ search: "rust", sort: "relevance", limit: 2, cursor });
      seen.push(...page.items.map((entry) => entry.id));
      cursor = page.nextCursor;
    } while (cursor);
    // Title matches (odd indexes) first, newest first within equal scores.
    expect(seen).toEqual(["rust-3", "rust-1", "rust-4", "rust-2", "rust-0"]);
  });
});
