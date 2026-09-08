import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres, { type Sql } from "postgres";

import { createAuthContext } from "@/lib/contracts/tenant-context";
import { createContentVersionIdentity, sha256 } from "@/lib/knowledge/content-identity";
import { createClaimEvidence } from "@/lib/knowledge/grounding";
import type { ContentItem } from "@/lib/types";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { applyTenantMigrationStage } from "../tenant-migration/migrator";
import { buildTenantMigrationReport } from "../tenant-migration/verifier";
import { createPostgresRepositoryAccess } from "../tenant-repositories";

jest.setTimeout(120_000);

const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const tenantMigrations = resolve(process.cwd(), "src/lib/postgres/tenant-migrations");
const rolesSql = resolve(process.cwd(), "src/lib/postgres/roles/phase3_roles.sql");
const runtimeRole = "distil_tenant_upsert_test_app";
const runtimePassword = "distil_tenant_upsert_test_password";
const at = "2026-09-08T04:00:00.000Z";

const alphaContext = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000041",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000041",
  requestId: "30000000-0000-4000-8000-000000000041",
});
const betaContext = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000042",
  actorKind: "user",
  actorId: "10000000-0000-4000-8000-000000000042",
  requestId: "30000000-0000-4000-8000-000000000042",
});

const item = (id: string): ContentItem => ({
  id,
  title: `Item ${id}`,
  summary: "Tenant upsert integration coverage.",
  fullContent: "The first grounded fact. The second grounded fact.",
  sourceType: "manual",
  contentType: "article",
  topics: ["tenant-upserts"],
  url: `https://example.com/${id}`,
  priority: "medium",
  isRead: false,
  createdAt: at,
  processingStatus: "ready",
});

let runtimeSql: Sql;

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
  await harness.sql.unsafe("DROP TABLE __distil_test_migrations");
  await harness.sql.unsafe(await readFile(rolesSql, "utf8"));
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "expand",
    ownerId: alphaContext.userId,
    migrationsDirectory: tenantMigrations,
  });
  const baseline = await buildTenantMigrationReport({
    client: harness.sql,
    stage: "before",
    ownerId: alphaContext.userId,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "backfill",
    ownerId: alphaContext.userId,
    migrationsDirectory: tenantMigrations,
  });
  await applyTenantMigrationStage({
    sql: harness.sql,
    stage: "contract",
    ownerId: alphaContext.userId,
    migrationsDirectory: tenantMigrations,
    baseline,
  });
  await harness.sql`
    INSERT INTO users (id,status) VALUES (${betaContext.userId}::uuid,'active')
  `;
  await harness.sql.unsafe(`
    CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
    GRANT distil_runtime TO ${runtimeRole};
  `);

  const runtimeUri = new URL(harness.connectionUri);
  runtimeUri.username = runtimeRole;
  runtimeUri.password = runtimePassword;
  runtimeSql = postgres(runtimeUri.toString(), {
    max: 4,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  await runtimeSql`SELECT 1`;
});

afterAll(async () => {
  if (runtimeSql) await runtimeSql.end({ timeout: 5 });
  await harness.sql.unsafe(`
    DO $tenant_upsert_role_cleanup$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${runtimeRole}') THEN
        DROP OWNED BY ${runtimeRole};
        DROP ROLE ${runtimeRole};
      END IF;
    END
    $tenant_upsert_role_cleanup$;
  `);
  await harness.stop();
});

describe("tenant repositories through tenant_api security-barrier views", () => {
  it("replays and serializes every affected repository pattern without base-table access", async () => {
    const access = createPostgresRepositoryAccess(runtimeSql);
    const alpha = access.getTenantRepositories(alphaContext);
    const beta = access.getTenantRepositories(betaContext);
    await alpha.items.insert(item("tenant-upsert-item"));

    const noteInput = {
      itemId: "tenant-upsert-item",
      body: "first",
      createdAt: at,
      updatedAt: at,
    };
    await Promise.all([
      alpha.itemNotes.upsert(noteInput),
      alpha.itemNotes.upsert({ ...noteInput, body: "second" }),
    ]);
    expect(await alpha.itemNotes.find("tenant-upsert-item")).toEqual(
      expect.objectContaining({ body: expect.stringMatching(/^(first|second)$/) })
    );

    await alpha.collections.create({
      id: "tenant-upsert-collection",
      name: "Upserts",
      createdAt: at,
      updatedAt: at,
    });
    await alpha.collections.addItem({
      collectionId: "tenant-upsert-collection",
      itemId: "tenant-upsert-item",
      position: 0,
      addedAt: at,
    });
    await alpha.collections.addItem({
      collectionId: "tenant-upsert-collection",
      itemId: "tenant-upsert-item",
      position: 2,
      addedAt: at,
    });
    expect(await alpha.collections.listItems("tenant-upsert-collection")).toEqual([
      expect.objectContaining({ itemId: "tenant-upsert-item", position: 2 }),
    ]);

    const eventResults = await Promise.all([
      alpha.itemEvents.append({
        id: "tenant-upsert-event-a",
        eventKey: "tenant-upsert-event",
        itemId: "tenant-upsert-item",
        eventType: "opened",
        metadata: {},
        occurredAt: at,
      }),
      alpha.itemEvents.append({
        id: "tenant-upsert-event-b",
        eventKey: "tenant-upsert-event",
        itemId: "tenant-upsert-item",
        eventType: "opened",
        metadata: {},
        occurredAt: at,
      }),
    ]);
    expect(eventResults[0].id).toBe(eventResults[1].id);

    await alpha.digests.create({
      id: "tenant-upsert-legacy-digest-a",
      digestDate: "2026-09-08",
      status: "ready",
      createdAt: at,
      completedAt: at,
    });
    const replayedDigest = await alpha.digests.create({
      id: "tenant-upsert-legacy-digest-b",
      digestDate: "2026-09-08",
      status: "ready",
      createdAt: at,
      completedAt: at,
    });
    expect(replayedDigest.id).toBe("tenant-upsert-legacy-digest-a");

    await alpha.oauthTokens.upsert({
      provider: "slack",
      teamId: "tenant-upsert-team",
      accessToken: "first-token",
      updatedAt: at,
    });
    await alpha.oauthTokens.upsert({
      provider: "slack",
      teamId: "tenant-upsert-team",
      accessToken: "second-token",
      updatedAt: at,
    });
    expect(await alpha.oauthTokens.find("slack", "tenant-upsert-team")).toEqual(
      expect.objectContaining({ accessToken: "second-token" })
    );

    await alpha.summaries.upsert({
      id: "tenant-upsert-summary-a",
      itemId: "tenant-upsert-item",
      summary: "First summary",
      model: "test-model",
      promptType: "brief",
    });
    await alpha.summaries.upsert({
      id: "tenant-upsert-summary-b",
      itemId: "tenant-upsert-item",
      summary: "Second summary",
      model: "test-model",
      promptType: "brief",
    });
    expect(await alpha.summaries.find("tenant-upsert-item", "brief")).toEqual(
      expect.objectContaining({ id: "tenant-upsert-summary-b", summary: "Second summary" })
    );

    await Promise.all([
      alpha.settings.set("tenant-upsert-setting", "alpha-first"),
      alpha.settings.set("tenant-upsert-setting", "alpha-second"),
    ]);
    expect(await alpha.settings.get("tenant-upsert-setting")).toMatch(/^alpha-(first|second)$/);
    await beta.settings.set("tenant-upsert-setting", "beta");
    expect(await beta.settings.get("tenant-upsert-setting")).toBe("beta");

    await alpha.embeddings.upsert("tenant-upsert-item", [0.1, 0.2], "embed-v1");
    await alpha.embeddings.upsert("tenant-upsert-item", [0.3, 0.4], "embed-v2");
    expect(await alpha.embeddings.find("tenant-upsert-item")).toEqual(
      expect.objectContaining({ embedding: [0.3, 0.4], model: "embed-v2" })
    );

    const checkpoint = {
      jobKey: "tenant-upsert-backfill",
      jobType: "content_versions" as const,
      status: "pending" as const,
      checkpoint: { source: "first" },
      processedCount: 0,
      failedCount: 0,
      attempt: 0,
      updatedAt: at,
    };
    const backfillResults = await Promise.all([
      alpha.knowledgeBackfills.create(checkpoint),
      alpha.knowledgeBackfills.create({ ...checkpoint, checkpoint: { source: "second" } }),
    ]);
    expect(backfillResults[0]).toEqual(backfillResults[1]);
    await expect(beta.knowledgeBackfills.create(checkpoint)).resolves.toEqual(
      expect.objectContaining({ jobKey: "tenant-upsert-backfill" })
    );
  });

  it("replays chunks, claims, preferences, digest creation, and digest jobs", async () => {
    const alpha = createPostgresRepositoryAccess(runtimeSql).getTenantRepositories(alphaContext);
    const source = item("tenant-upsert-knowledge");
    await alpha.items.insert(source);
    const content = source.fullContent!;
    const identity = createContentVersionIdentity({
      itemId: source.id,
      content,
      extractorVersion: "extractor-v1",
    });
    const version = (
      await alpha.contentVersions.create({
        ...identity,
        itemId: source.id,
        extractorVersion: "extractor-v1",
        source: "full_content",
        content,
        characterCount: content.length,
        tokenCount: 10,
        createdAt: at,
      })
    ).record;
    const chunk = {
      id: "tenant-upsert-chunk",
      contentVersionId: version.id,
      itemId: source.id,
      ordinal: 0,
      content,
      contentHash: sha256(content),
      startOffset: 0,
      endOffset: content.length,
      tokenCount: 10,
      embeddingStatus: "unconfigured" as const,
      createdAt: at,
    };
    expect(await alpha.contentChunks.insertMany([chunk])).toEqual(
      expect.objectContaining({ insertedCount: 1 })
    );
    expect(await alpha.contentChunks.insertMany([chunk])).toEqual(
      expect.objectContaining({ insertedCount: 0 })
    );

    const artifact = (
      await alpha.intelligenceArtifacts.publish({
        id: "tenant-upsert-claims-artifact",
        itemId: source.id,
        contentVersionId: version.id,
        artifactType: "claims",
        status: "ready",
        provenance: "generated",
        makeCurrent: true,
        metadata: {},
        createdAt: at,
        updatedAt: at,
        completedAt: at,
      })
    ).record;
    const claimText = "The first grounded fact.";
    const claim = {
      id: "tenant-upsert-claim",
      artifactId: artifact.id,
      ordinal: 0,
      claim: claimText,
      claimHash: sha256(claimText),
      evidence: [
        createClaimEvidence({
          claimId: "tenant-upsert-claim",
          chunkId: chunk.id,
          chunkContent: content,
          startOffset: 0,
          endOffset: claimText.length,
        }),
      ],
    };
    await alpha.claims.insertWithEvidence([claim]);
    await alpha.claims.insertWithEvidence([claim]);
    expect(await alpha.claims.listForArtifact(artifact.id)).toEqual([
      expect.objectContaining({ id: claim.id, evidence: claim.evidence }),
    ]);

    await expect(alpha.digestExperience.getPreferences()).resolves.toEqual(
      expect.objectContaining({ digestTimezone: "UTC" })
    );
    await expect(alpha.digestExperience.getPreferences()).resolves.toEqual(
      expect.objectContaining({ digestTimezone: "UTC" })
    );
    const digest = {
      id: "tenant-upsert-experience-digest-a",
      localDate: "2026-09-09",
      timezone: "Asia/Kolkata",
      status: "ready" as const,
      contentMode: "deterministic" as const,
      selectionVersion: "deterministic-v1",
      selectionMetadata: {},
      title: "Digest",
      summary: "Summary",
      createdAt: at,
      completedAt: at,
      items: [],
    };
    await expect(alpha.digestExperience.createDigest(digest)).resolves.toEqual(digest);
    await expect(
      alpha.digestExperience.createDigest({ ...digest, id: "tenant-upsert-experience-digest-b" })
    ).resolves.toEqual(expect.objectContaining({ id: digest.id }));

    const job = {
      id: "tenant-upsert-digest-job-a",
      localDate: "2026-09-09",
      idempotencyKey: "digest:2026-09-09",
      status: "queued" as const,
      requestedBy: "manual" as const,
      createdAt: at,
    };
    await expect(alpha.digestExperience.enqueue(job)).resolves.toEqual(
      expect.objectContaining({ id: job.id })
    );
    await expect(
      alpha.digestExperience.enqueue({ ...job, id: "tenant-upsert-digest-job-b" })
    ).resolves.toEqual(expect.objectContaining({ id: job.id }));
  });
});
