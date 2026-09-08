import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  enqueueKnowledgeBackfill,
  runKnowledgeBackfillBatch,
  type KnowledgeBackfillKind,
} from "@/lib/knowledge/jobs";
import type { ContentItem } from "@/lib/types";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { applyTenantMigrationStage } from "../tenant-migration/migrator";
import { buildTenantMigrationReport } from "../tenant-migration/verifier";
import { createPostgresRepositoryAccess } from "../tenant-repositories";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");
const now = () => new Date("2026-09-07T12:00:00.000Z");
const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "system",
  actorId: "20000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
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
afterAll(async () => harness.stop());

describe("Phase 2 migration and durable intelligence backfill", () => {
  it("resumes bounded queued batches from legacy rows through degraded artifacts", async () => {
    await harness.reset();
    await harness.sql`
      INSERT INTO users (id, status) VALUES (${context.userId}::uuid, 'active')
    `;
    const repositories = createPostgresRepositoryAccess(harness.sql).getTenantRepositories(context);
    const base: Omit<ContentItem, "id" | "title" | "url" | "summary"> = {
      sourceType: "manual",
      contentType: "article",
      topics: [],
      priority: "medium",
      isRead: false,
      createdAt: now().toISOString(),
      processingStatus: "ready",
    };
    await repositories.items.insert({
      ...base,
      id: "a-full",
      title: "Full",
      url: "https://example.com/full",
      summary: "Short fallback.",
      fullContent:
        "Full source sentence one. Full source sentence two. Full source sentence three.",
    });
    await repositories.items.insert({
      ...base,
      id: "b-summary",
      title: "Summary only",
      url: "https://example.com/summary",
      summary: "Summary source sentence one. Summary source sentence two.",
    });
    await repositories.summaries.upsert({
      id: "legacy-summary",
      itemId: "a-full",
      summary: "Existing AI summary",
      model: "legacy-model",
      promptType: "brief",
    });

    async function run(kind: KnowledgeBackfillKind) {
      const initial = await enqueueKnowledgeBackfill({
        context,
        repositories,
        kind,
        batchSize: 1,
        now,
      });
      let current = initial;
      while (current.status !== "completed") {
        const job = await repositories.jobs.dequeue(`worker-${kind}`);
        expect(job).toBeDefined();
        const payload = job!.payload;
        current = await runKnowledgeBackfillBatch(context, payload, { ...repositories, now });
        await repositories.jobs.complete(String(job!.id));
      }
      return current;
    }

    expect(await run("content_versions")).toMatchObject({
      status: "completed",
      processedCount: 2,
    });
    expect((await repositories.contentVersions.findLatestForItem("a-full"))?.source).toBe(
      "full_content"
    );
    expect((await repositories.contentVersions.findLatestForItem("b-summary"))?.source).toBe(
      "summary"
    );

    expect(await run("chunks")).toMatchObject({ status: "completed", processedCount: 2 });
    expect(await run("legacy_artifacts")).toMatchObject({
      status: "completed",
      processedCount: 1,
    });
    expect(await run("degraded_summaries")).toMatchObject({
      status: "completed",
      processedCount: 1,
    });

    expect(
      await repositories.intelligenceArtifacts.findCurrent("a-full", "brief_summary")
    ).toMatchObject({
      provenance: "legacy_unverified",
      content: "Existing AI summary",
    });
    expect(
      await repositories.intelligenceArtifacts.findCurrent("b-summary", "brief_summary")
    ).toMatchObject({
      provenance: "deterministic_fallback",
      status: "degraded",
      content: expect.stringContaining("Summary source sentence one."),
    });
  });
});
