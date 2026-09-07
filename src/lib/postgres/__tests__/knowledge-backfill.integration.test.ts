import { resolve } from "node:path";
import {
  enqueueKnowledgeBackfill,
  runKnowledgeBackfillBatch,
  type KnowledgeBackfillKind,
} from "@/lib/knowledge/jobs";
import type { ContentItem } from "@/lib/types";
import { PostgresTestHarness } from "../../../../tests/support/postgres";
import { createPostgresRepositories } from "../repositories";

jest.setTimeout(120_000);
const harness = new PostgresTestHarness();
const migrations = resolve(process.cwd(), "src/lib/postgres/migrations");
const now = () => new Date("2026-09-07T12:00:00.000Z");

beforeAll(async () => {
  await harness.start();
  await harness.migrate(migrations);
});
afterAll(async () => harness.stop());

describe("Phase 2 migration and durable intelligence backfill", () => {
  it("resumes bounded queued batches from legacy rows through degraded artifacts", async () => {
    await harness.reset();
    const repositories = createPostgresRepositories(harness.sql);
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
        current = await runKnowledgeBackfillBatch(payload, { ...repositories, now });
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
