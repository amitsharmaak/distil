import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chunkContent, estimateTokenCount } from "../chunking";
import { createContentVersionIdentity } from "../content-identity";
import { PostgresPassageSearchStore } from "../retrieval";
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
  await harness.sql`
    INSERT INTO users (id, status) VALUES (${context.userId}::uuid, 'active')
    ON CONFLICT (id) DO UPDATE SET status='active'
  `;
});
afterAll(async () => harness.stop());

describe("PostgreSQL passage retrieval", () => {
  it("filters before ranking and searches latest chunk text plus item metadata", async () => {
    const repositories = createPostgresRepositories(harness.sql);
    async function seed(id: string, content: string, patch: Partial<ContentItem> = {}) {
      const item: ContentItem = {
        id,
        title: id,
        summary: "saved knowledge",
        sourceType: "manual",
        contentType: "article",
        topics: ["systems"],
        url: `https://example.com/${id}`,
        priority: "medium",
        isRead: false,
        createdAt: "2026-09-07T00:00:00Z",
        processingStatus: "ready",
        ...patch,
      };
      await repositories.items.insert(item);
      const identity = createContentVersionIdentity({
        itemId: id,
        content,
        extractorVersion: "test-v1",
      });
      const version = (
        await repositories.contentVersions.create({
          ...identity,
          itemId: id,
          extractorVersion: "test-v1",
          source: "full_content",
          content,
          characterCount: content.length,
          tokenCount: estimateTokenCount(content),
          createdAt: "2026-09-07T00:00:00Z",
        })
      ).record;
      await repositories.contentChunks.insertMany(
        chunkContent(version.id, content).map((chunk) => ({
          ...chunk,
          itemId: id,
          embeddingStatus: "unconfigured" as const,
          createdAt: "2026-09-07T00:00:00Z",
        }))
      );
    }

    await seed("chunk-match", "A PostgreSQL durable queue persists work before processing.");
    await seed("metadata-match", "This passage describes compatibility boundaries.", {
      title: "PostgreSQL vector contracts",
      sourceType: "publisher",
    });
    await seed("archived", "A PostgreSQL durable queue should not appear.", {
      archivedAt: "2026-09-07T01:00:00Z",
    });

    const store = new PostgresPassageSearchStore(harness.sql, context);
    const results = await store.searchKeyword({ query: "PostgreSQL", limit: 10 });
    expect(results.map((result) => result.itemId)).toEqual(["chunk-match", "metadata-match"]);
    expect(results[0]).toMatchObject({
      reasons: expect.arrayContaining(["keyword:chunk_text"]),
      retrievalMode: "keyword",
      degradation: [expect.objectContaining({ code: "SEMANTIC_UNAVAILABLE" })],
    });
    expect(results[0].excerpt).toContain("PostgreSQL durable queue");
    expect(await store.searchKeyword({ query: "PostgreSQL", sources: ["publisher"] })).toEqual([
      expect.objectContaining({ itemId: "metadata-match", reasons: ["keyword:item_metadata"] }),
    ]);
  });
});
