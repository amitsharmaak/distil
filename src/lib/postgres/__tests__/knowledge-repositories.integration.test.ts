import { resolve } from "node:path";
import { createClaimEvidence } from "@/lib/knowledge/grounding";
import { createContentVersionIdentity, sha256 } from "@/lib/knowledge/content-identity";
import type { ContentItem } from "@/lib/types";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { createPostgresRepositories } from "../repositories";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const at = "2026-09-07T12:00:00.000Z";

const item = (id: string): ContentItem => ({
  id,
  title: "Knowledge item",
  summary: "A concise source summary.",
  fullContent: "The first grounded fact. The second grounded fact.",
  sourceType: "manual",
  contentType: "article",
  topics: ["knowledge"],
  url: `https://example.com/${id}`,
  priority: "medium",
  isRead: false,
  createdAt: at,
  processingStatus: "ready",
});

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
});
afterEach(async () => harness.reset());
afterAll(async () => harness.stop());

describe("Phase 2 intelligence PostgreSQL repositories", () => {
  it("assigns immutable content versions and inserts deterministic chunks idempotently", async () => {
    const repositories = createPostgresRepositories(harness.sql);
    await repositories.items.insert(item("versioned"));
    const content = "The first grounded fact. The second grounded fact.";
    const identity = createContentVersionIdentity({
      itemId: "versioned",
      content,
      extractorVersion: "extractor-v1",
    });
    const input = {
      ...identity,
      itemId: "versioned",
      extractorVersion: "extractor-v1",
      source: "full_content" as const,
      content,
      characterCount: content.length,
      tokenCount: 10,
      createdAt: at,
    };
    const first = await repositories.contentVersions.create(input);
    const replay = await repositories.contentVersions.create(input);
    expect(first).toMatchObject({ created: true, record: { version: 1 } });
    expect(replay).toMatchObject({ created: false, record: { id: first.record.id, version: 1 } });

    await expect(
      harness.sql`UPDATE item_content_versions SET content='changed' WHERE id=${first.record.id}`
    ).rejects.toThrow(/immutable/);

    const chunk = {
      id: "chunk-1",
      contentVersionId: first.record.id,
      itemId: "versioned",
      ordinal: 0,
      content,
      contentHash: sha256(content),
      startOffset: 0,
      endOffset: content.length,
      tokenCount: 10,
      embeddingStatus: "unconfigured" as const,
      createdAt: at,
    };
    expect(await repositories.contentChunks.insertMany([chunk])).toMatchObject({
      insertedCount: 1,
    });
    expect(await repositories.contentChunks.insertMany([chunk])).toMatchObject({
      insertedCount: 0,
    });
    expect(await repositories.contentChunks.listForContentVersion(first.record.id)).toEqual([
      expect.objectContaining({ id: "chunk-1", embeddingStatus: "unconfigured" }),
    ]);
  });

  it("promotes artifact history and stores validated claims with evidence atomically", async () => {
    const repositories = createPostgresRepositories(harness.sql);
    await repositories.items.insert(item("artifact"));
    const content = "The first grounded fact. The second grounded fact.";
    const identity = createContentVersionIdentity({
      itemId: "artifact",
      content,
      extractorVersion: "extractor-v1",
    });
    const version = (
      await repositories.contentVersions.create({
        ...identity,
        itemId: "artifact",
        extractorVersion: "extractor-v1",
        source: "full_content",
        content,
        characterCount: content.length,
        tokenCount: 10,
        createdAt: at,
      })
    ).record;
    await repositories.contentChunks.insertMany([
      {
        id: "evidence-chunk",
        contentVersionId: version.id,
        itemId: "artifact",
        ordinal: 0,
        content,
        contentHash: sha256(content),
        startOffset: 0,
        endOffset: content.length,
        tokenCount: 10,
        embeddingStatus: "unconfigured",
        createdAt: at,
      },
    ]);

    const legacy = await repositories.intelligenceArtifacts.publish({
      id: "legacy-artifact",
      itemId: "artifact",
      contentVersionId: version.id,
      artifactType: "brief_summary",
      status: "ready",
      content: "Legacy",
      contentHash: sha256("Legacy"),
      provenance: "legacy_unverified",
      makeCurrent: false,
      makeCurrentIfNone: true,
      metadata: { verified: false },
      createdAt: at,
      updatedAt: at,
      completedAt: at,
    });
    expect(legacy.record).toMatchObject({ version: 1, isCurrent: true });
    const generated = await repositories.intelligenceArtifacts.publish({
      id: "generated-artifact",
      itemId: "artifact",
      contentVersionId: version.id,
      artifactType: "brief_summary",
      status: "ready",
      content: "Generated",
      contentHash: sha256("Generated"),
      provenance: "generated",
      makeCurrent: true,
      metadata: {},
      createdAt: at,
      updatedAt: at,
      completedAt: at,
    });
    expect(generated.record).toMatchObject({ version: 2, isCurrent: true });
    expect(await repositories.intelligenceArtifacts.listForItem("artifact")).toEqual([
      expect.objectContaining({ id: "legacy-artifact", status: "stale", isCurrent: false }),
      expect.objectContaining({ id: "generated-artifact", status: "ready", isCurrent: true }),
    ]);

    const claimsArtifact = (
      await repositories.intelligenceArtifacts.publish({
        id: "claims-artifact",
        itemId: "artifact",
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
    const evidence = createClaimEvidence({
      claimId: "claim-1",
      chunkId: "evidence-chunk",
      chunkContent: content,
      startOffset: 0,
      endOffset: claimText.length,
    });
    await repositories.claims.insertWithEvidence([
      {
        id: "claim-1",
        artifactId: claimsArtifact.id,
        ordinal: 0,
        claim: claimText,
        claimHash: sha256(claimText),
        confidence: 0.9,
        evidence: [evidence],
      },
    ]);
    expect(await repositories.claims.listForArtifact(claimsArtifact.id)).toEqual([
      expect.objectContaining({ id: "claim-1", evidence: [evidence] }),
    ]);

    await expect(
      repositories.claims.insertWithEvidence([
        {
          id: "bad-claim",
          artifactId: claimsArtifact.id,
          ordinal: 1,
          claim: "Bad evidence",
          claimHash: sha256("Bad evidence"),
          evidence: [{ ...evidence, claimId: "bad-claim", exactExcerpt: "fabricated" }],
        },
      ])
    ).rejects.toThrow(/does not match chunk/);
    expect(await repositories.claims.listForArtifact(claimsArtifact.id)).toHaveLength(1);
  });

  it("compare-and-sets resumable checkpoints and deduplicates queue job ids", async () => {
    const repositories = createPostgresRepositories(harness.sql);
    const initial = {
      jobKey: "backfill",
      jobType: "content_versions" as const,
      status: "pending" as const,
      checkpoint: { scope: "ready:v1" },
      processedCount: 0,
      failedCount: 0,
      attempt: 0,
      updatedAt: at,
    };
    await repositories.knowledgeBackfills.create(initial);
    await repositories.knowledgeBackfills.create(initial);
    expect(await repositories.knowledgeBackfills.start("backfill", at)).toMatchObject({
      status: "running",
      attempt: 1,
    });
    expect(
      await repositories.knowledgeBackfills.advance("backfill", {
        cursor: "item-b",
        checkpoint: { scope: "ready:v1", batch: 2 },
        processedDelta: 2,
        completed: false,
        at,
      })
    ).toMatchObject({ cursor: "item-b", processedCount: 2 });
    await expect(
      repositories.knowledgeBackfills.advance("backfill", {
        cursor: "wrong",
        checkpoint: {},
        processedDelta: 99,
        completed: false,
        at,
      })
    ).resolves.toBeUndefined();

    const queued = { id: "same-job", jobType: "knowledge_backfill", payload: "{}" };
    await repositories.jobs.enqueue(queued);
    await repositories.jobs.enqueue(queued);
    expect(
      await harness.sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM job_queue WHERE id='same-job'
      `
    ).toEqual([{ count: 1 }]);
  });
});
