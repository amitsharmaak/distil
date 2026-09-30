import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createAuthContext } from "@/lib/contracts/tenant-context";
import { applyTenantMigrationStage } from "@/lib/postgres/tenant-migration/migrator";
import { buildTenantMigrationReport } from "@/lib/postgres/tenant-migration/verifier";
import { createPostgresRepositoryAccess } from "@/lib/postgres/tenant-repositories";
import type { ContentItem } from "@/lib/types";
import { PostgresTestHarness } from "../../../../tests/support/postgres";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");

const owner = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});
const other = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000002",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000002",
  requestId: "30000000-0000-4000-8000-000000000002",
});

const item = (id: string, patch: Partial<ContentItem> = {}): ContentItem => ({
  id,
  title: `Title ${id}`,
  summary: "summary",
  sourceType: "manual",
  contentType: "article",
  topics: [],
  url: `https://example.test/${id}`,
  priority: "medium",
  isRead: false,
  createdAt: "2026-09-06T00:00:00.000Z",
  processingStatus: "ready",
  ...patch,
});

const classification = {
  area: "work" as const,
  confidence: 0.9,
  reason: "Meeting notes.",
  model: "gemini-3.5-flash-lite",
  classifiedAt: "2026-09-29T12:00:00.000Z",
};

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
  await harness.sql.unsafe("DROP TABLE __distil_test_migrations");
  await harness.sql.unsafe(await readFile(rolesSql, "utf8"));
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "expand",
    ownerId: owner.userId,
    migrationsDirectory: tenantMigrations,
  });
  const baseline = await buildTenantMigrationReport({
    client: harness.sql,
    stage: "before",
    ownerId: owner.userId,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "backfill",
    ownerId: owner.userId,
    migrationsDirectory: tenantMigrations,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "contract",
    ownerId: owner.userId,
    migrationsDirectory: tenantMigrations,
    baseline,
  });
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
      ownerId: owner.userId,
      migrationsDirectory: tenantMigrations,
    });
  }
});
beforeEach(async () => {
  await harness.reset();
  for (const { userId } of [owner, other]) {
    await harness.sql`INSERT INTO users (id, status) VALUES (${userId}::uuid, 'active')`;
  }
});
afterAll(async () => harness.stop());

const repositoriesFor = (context: typeof owner) =>
  createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);

/** F4 owns writing corrections; the test sets them directly on the base table. */
async function correct(userId: string, id: string, area: string, at: string) {
  await harness.sql`
    UPDATE public.items SET manual_area=${area}, manual_area_at=${at}::timestamptz
    WHERE user_id=${userId}::uuid AND id=${id}`;
}

describe("life-area item columns", () => {
  it("stores the AI answer through the tenant view and reads it back", async () => {
    const repos = repositoriesFor(owner);
    await repos.items.insert(item("granola"));
    expect(await repos.items.findAreaState("granola")).toEqual({});
    await repos.items.setAiArea("granola", classification);
    expect(await repos.items.findAreaState("granola")).toEqual({
      area: "work",
      areaClassifiedAt: "2026-09-29T12:00:00.000Z",
    });
    const [row] = await harness.sql`
      SELECT area_confidence, area_reason, area_model FROM public.items WHERE id='granola'`;
    expect(row).toEqual({
      area_confidence: 0.9,
      area_reason: "Meeting notes.",
      area_model: "gemini-3.5-flash-lite",
    });
    expect(await repos.items.findAreaState("missing")).toBeUndefined();
  });

  it("never overwrites Amit's correction when the AI reclassifies", async () => {
    const repos = repositoriesFor(owner);
    await repos.items.insert(item("school"));
    await correct(owner.userId, "school", "personal", "2026-09-29T09:00:00Z");
    await repos.items.setAiArea("school", { ...classification, area: "updates" });
    expect(await repos.items.findAreaState("school")).toEqual({
      area: "updates",
      manualArea: "personal",
      areaClassifiedAt: "2026-09-29T12:00:00.000Z",
    });
    // Ordinary item updates leave every area column alone.
    await repos.items.update("school", { title: "Renamed" });
    expect((await repos.items.findAreaState("school"))?.manualArea).toBe("personal");
  });

  it("lists only real corrections, newest first, for the calling tenant only", async () => {
    const repos = repositoriesFor(owner);
    await repos.items.insert(item("a", { author: "Head teacher", publication: "School news" }));
    await repos.items.insert(item("b"));
    await repos.items.insert(item("agreed"));
    await repos.items.insert(item("uncorrected"));
    await repos.items.setAiArea("a", { ...classification, area: "updates" });
    await repos.items.setAiArea("agreed", classification);
    await correct(owner.userId, "a", "personal", "2026-09-29T08:00:00Z");
    await correct(owner.userId, "b", "learning", "2026-09-29T10:00:00Z");
    // Same area as the AI's: not a correction.
    await correct(owner.userId, "agreed", "work", "2026-09-29T11:00:00Z");
    await repositoriesFor(other).items.insert(item("foreign"));
    await correct(other.userId, "foreign", "work", "2026-09-29T12:00:00Z");

    expect(await repos.items.listAreaCorrections(20)).toEqual([
      {
        title: "Title b",
        url: "https://example.test/b",
        sourceType: "manual",
        author: undefined,
        publication: undefined,
        aiArea: undefined,
        correctedArea: "learning",
      },
      {
        title: "Title a",
        url: "https://example.test/a",
        sourceType: "manual",
        author: "Head teacher",
        publication: "School news",
        aiArea: "updates",
        correctedArea: "personal",
      },
    ]);
    expect(await repos.items.listAreaCorrections(1)).toHaveLength(1);
  });

  it("carries the AI area, the correction and the effective area on every item projection", async () => {
    const repos = repositoriesFor(owner);
    await repos.items.insert(item("projected"));
    expect(await repos.items.findById("projected")).not.toHaveProperty("area");

    await repos.items.setAiArea("projected", { ...classification, area: "updates" });
    expect(await repos.items.findById("projected")).toMatchObject({
      area: "updates",
      aiArea: "updates",
    });

    await repos.items.setManualArea("projected", "personal", "2026-09-29T13:00:00.000Z");
    const corrected = await repos.items.findById("projected");
    expect(corrected).toMatchObject({
      area: "personal",
      aiArea: "updates",
      manualArea: "personal",
    });
    const [summary] = await repos.items.listSummaries({ includeProcessing: true });
    expect(summary).toMatchObject({ area: "personal", aiArea: "updates", manualArea: "personal" });
    expect(await repos.items.listAreaCorrections(5)).toEqual([
      expect.objectContaining({ title: "Title projected", correctedArea: "personal" }),
    ]);

    await repos.items.setManualArea("projected", null, "2026-09-29T14:00:00.000Z");
    const [row] = await harness.sql`
      SELECT manual_area, manual_area_at FROM public.items WHERE id='projected'`;
    expect(row).toEqual({ manual_area: null, manual_area_at: null });
    expect((await repos.items.findById("projected"))?.area).toBe("updates");
  });

  it("rejects an area outside the four through the check constraints", async () => {
    const repos = repositoriesFor(owner);
    await repos.items.insert(item("x"));
    await expect(
      repos.items.setAiArea("x", { ...classification, area: "hobbies" as never })
    ).rejects.toThrow(/items_area_check/);
    await expect(
      repos.items.setAiArea("x", { ...classification, confidence: 1.5 })
    ).rejects.toThrow(/items_area_confidence_check/);
    await expect(correct(owner.userId, "x", "family", "2026-09-29T00:00:00Z")).rejects.toThrow(
      /items_manual_area_check/
    );
  });
});

describe("area backfill queries", () => {
  it("lists only the caller's unclassified, uncorrected, ready items in id order", async () => {
    const repos = repositoriesFor(owner);
    for (const id of ["a", "b", "c", "d", "e"]) await repos.items.insert(item(id));
    await repos.items.insert(item("p", { processingStatus: "processing" }));
    await repos.items.setAiArea("b", classification);
    await correct(owner.userId, "c", "personal", "2026-09-29T00:00:00Z");
    await repositoriesFor(other).items.insert(item("f"));

    expect(await repos.items.listAreaBackfillCandidates({ limit: 10 })).toEqual(["a", "d", "e"]);
    expect(await repos.items.listAreaBackfillCandidates({ afterId: "a", limit: 1 })).toEqual(["d"]);
    expect(await repositoriesFor(other).items.listAreaBackfillCandidates({ limit: 10 })).toEqual([
      "f",
    ]);
    expect(await repos.items.countAreas()).toEqual({
      byArea: { personal: 1, work: 1, learning: 0, updates: 0 },
      unclassified: 3,
      corrected: 1,
    });
  });

  it("records a job's result in its payload and lists the caller's jobs by type", async () => {
    const repos = repositoriesFor(owner);
    const jobId = "50000000-0000-4000-8000-000000000001";
    await repos.jobs.enqueue({
      userId: owner.userId,
      id: jobId,
      jobType: "items.area-backfill",
      idempotencyKey: "area-backfill:run:0",
      payload: JSON.stringify({ batchIndex: 0 }),
    });
    await repositoriesFor(other).jobs.enqueue({
      userId: other.userId,
      id: "50000000-0000-4000-8000-000000000002",
      jobType: "items.area-backfill",
      idempotencyKey: "area-backfill:run:0",
      payload: JSON.stringify({ batchIndex: 0 }),
    });

    await repos.jobs.recordResult?.(jobId, { status: "completed", classified: 3 });

    const jobs = (await repos.jobs.listRecentByType?.("items.area-backfill", 10)) ?? [];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: jobId,
      status: "pending",
      payload: { batchIndex: 0, result: { status: "completed", classified: 3 } },
    });
  });
});
