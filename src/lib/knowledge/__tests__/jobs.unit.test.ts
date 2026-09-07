import type { KnowledgeBackfillCheckpoint } from "../types";
import {
  enqueueKnowledgeBackfill,
  KNOWLEDGE_BACKFILL_QUEUE_JOB,
  runKnowledgeBackfillBatch,
  type KnowledgeBackfillDependencies,
} from "../jobs";

const now = () => new Date("2026-09-07T12:00:00.000Z");

function checkpoint(
  overrides: Partial<KnowledgeBackfillCheckpoint> = {}
): KnowledgeBackfillCheckpoint {
  return {
    jobKey: "kbf_job",
    jobType: "content_versions",
    status: "pending",
    checkpoint: { scope: "test" },
    processedCount: 0,
    failedCount: 0,
    attempt: 0,
    updatedAt: now().toISOString(),
    ...overrides,
  };
}

function dependencies(
  current: KnowledgeBackfillCheckpoint = checkpoint()
): KnowledgeBackfillDependencies {
  return {
    contentVersions: {
      findById: jest.fn(),
      findLatestForItem: jest.fn(),
      listForItem: jest.fn(),
      create: jest.fn(),
      listReadyCandidates: jest.fn().mockResolvedValue([]),
    },
    contentChunks: {
      findById: jest.fn(),
      listForContentVersion: jest.fn(),
      insertMany: jest.fn(),
      listUnchunkedVersions: jest.fn().mockResolvedValue([]),
    },
    intelligenceArtifacts: {
      findById: jest.fn(),
      findCurrent: jest.fn(),
      listForItem: jest.fn(),
      publish: jest.fn(),
      updatePending: jest.fn(),
      complete: jest.fn(),
      listLegacySummaryCandidates: jest.fn().mockResolvedValue([]),
      listDegradedSummaryCandidates: jest.fn().mockResolvedValue([]),
    },
    knowledgeBackfills: {
      find: jest.fn().mockResolvedValue(current),
      create: jest.fn().mockImplementation(async (value) => value),
      start: jest.fn().mockResolvedValue({ ...current, status: "running", attempt: 1 }),
      advance: jest.fn().mockImplementation(async (_jobKey, advance) => ({
        ...current,
        status: advance.completed ? "completed" : "running",
        cursor: advance.cursor,
        processedCount: current.processedCount + advance.processedDelta,
      })),
      fail: jest.fn().mockResolvedValue({ ...current, status: "failed" }),
      listByType: jest.fn(),
    },
    jobs: {
      enqueue: jest.fn(),
      dequeue: jest.fn(),
      complete: jest.fn(),
      getStats: jest.fn(),
    },
    now,
  };
}

describe("knowledge backfill jobs", () => {
  it("creates one checkpoint and enqueues a durable bounded job", async () => {
    const deps = dependencies();
    const created = await enqueueKnowledgeBackfill({
      repositories: deps,
      kind: "content_versions",
      scope: "ready:v1",
      batchSize: 10,
      now,
    });

    expect(created).toMatchObject({
      jobType: "content_versions",
      checkpoint: expect.objectContaining({ kind: "content_versions", batchSize: 10 }),
    });
    expect(deps.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: KNOWLEDGE_BACKFILL_QUEUE_JOB,
        maxRetries: 5,
        payload: expect.stringContaining('"expectedCursor":null'),
      })
    );
  });

  it("does not enqueue an already completed checkpoint", async () => {
    const deps = dependencies(checkpoint({ status: "completed" }));
    jest
      .mocked(deps.knowledgeBackfills.create)
      .mockResolvedValue(checkpoint({ status: "completed" }));
    await enqueueKnowledgeBackfill({ repositories: deps, kind: "content_versions", now });
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
  });

  it("uses full content, falls back to summary, and persists a continuation", async () => {
    const deps = dependencies();
    jest.mocked(deps.contentVersions.listReadyCandidates).mockResolvedValue([
      { itemId: "a", title: "A", fullContent: " Full article. ", summary: "Short A" },
      { itemId: "b", title: "B", fullContent: "  ", summary: " Summary B. " },
      { itemId: "c", title: "C", summary: "Summary C." },
    ]);
    jest.mocked(deps.contentVersions.create).mockImplementation(async (record) => ({
      record: { ...record, version: 1 },
      created: true,
    }));

    const result = await runKnowledgeBackfillBatch(
      { jobKey: "kbf_job", kind: "content_versions", batchSize: 2 },
      deps
    );

    expect(deps.contentVersions.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ itemId: "a", source: "full_content", content: "Full article." })
    );
    expect(deps.contentVersions.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ itemId: "b", source: "summary", content: "Summary B." })
    );
    expect(deps.jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String(jest.mocked(deps.jobs.enqueue).mock.calls[0][0].payload))
    ).toMatchObject({
      expectedCursor: "b",
    });
    expect(deps.knowledgeBackfills.advance).toHaveBeenCalledWith(
      "kbf_job",
      expect.objectContaining({ cursor: "b", processedDelta: 2, completed: false })
    );
    expect(result).toMatchObject({ status: "running", cursor: "b", processedCount: 2 });
  });

  it("chunks versions with source offsets and no configured embeddings", async () => {
    const current = checkpoint({ jobType: "chunks" });
    const deps = dependencies(current);
    jest.mocked(deps.contentChunks.listUnchunkedVersions).mockResolvedValue([
      {
        id: "version-a",
        itemId: "a",
        version: 1,
        contentHash: "sha256:" + "1".repeat(64),
        extractorVersion: "v1",
        source: "full_content",
        content: "One sentence. Another sentence.",
        characterCount: 31,
        tokenCount: 8,
        createdAt: now().toISOString(),
      },
    ]);
    jest.mocked(deps.contentChunks.insertMany).mockImplementation(async (records) => ({
      records,
      insertedCount: records.length,
    }));

    await runKnowledgeBackfillBatch({ jobKey: "kbf_job", kind: "chunks", batchSize: 5 }, deps);

    const chunks = jest.mocked(deps.contentChunks.insertMany).mock.calls[0][0];
    expect(chunks).toEqual([
      expect.objectContaining({
        itemId: "a",
        contentVersionId: "version-a",
        startOffset: 0,
        endOffset: 31,
        embeddingStatus: "unconfigured",
      }),
    ]);
    expect(deps.knowledgeBackfills.advance).toHaveBeenCalledWith(
      "kbf_job",
      expect.objectContaining({ cursor: "version-a", completed: true })
    );
  });

  it("imports legacy summaries without verification and generates explicit fallbacks", async () => {
    const legacy = checkpoint({ jobType: "legacy_artifacts" });
    const legacyDeps = dependencies(legacy);
    jest.mocked(legacyDeps.intelligenceArtifacts.listLegacySummaryCandidates).mockResolvedValue([
      {
        summaryId: "summary-a",
        itemId: "a",
        contentVersionId: "version-a",
        promptType: "brief",
        summary: "Legacy summary",
        model: "old-model",
        createdAt: now().toISOString(),
      },
    ]);
    jest.mocked(legacyDeps.intelligenceArtifacts.publish).mockImplementation(async (record) => ({
      record: { ...record, version: 1, isCurrent: true },
      created: true,
    }));
    await runKnowledgeBackfillBatch(
      { jobKey: "kbf_job", kind: "legacy_artifacts", batchSize: 5 },
      legacyDeps
    );
    expect(legacyDeps.intelligenceArtifacts.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: "legacy_unverified",
        status: "ready",
        makeCurrentIfNone: true,
        metadata: { legacySummaryId: "summary-a", verified: false },
      })
    );

    const degradedDeps = dependencies(legacy);
    jest
      .mocked(degradedDeps.intelligenceArtifacts.listDegradedSummaryCandidates)
      .mockResolvedValue([
        {
          itemId: "b",
          title: "Article title",
          contentVersionId: "version-b",
          content: "First fact. Second fact. Third fact.",
        },
      ]);
    jest.mocked(degradedDeps.intelligenceArtifacts.publish).mockImplementation(async (record) => ({
      record: { ...record, version: 1, isCurrent: true },
      created: true,
    }));
    await runKnowledgeBackfillBatch(
      { jobKey: "kbf_job", kind: "degraded_summaries", batchSize: 5 },
      degradedDeps
    );
    expect(degradedDeps.intelligenceArtifacts.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        provenance: "deterministic_fallback",
        status: "degraded",
        content: "Article title\n\nFirst fact.\n\nSecond fact.",
        errorCode: "generation_unavailable",
      })
    );
  });

  it("fails the durable checkpoint when a batch write fails", async () => {
    const deps = dependencies();
    jest
      .mocked(deps.contentVersions.listReadyCandidates)
      .mockResolvedValue([{ itemId: "a", title: "A", summary: "Summary" }]);
    jest.mocked(deps.contentVersions.create).mockRejectedValue(new Error("database unavailable"));

    await expect(
      runKnowledgeBackfillBatch({ jobKey: "kbf_job", kind: "content_versions", batchSize: 5 }, deps)
    ).rejects.toThrow("database unavailable");
    expect(deps.knowledgeBackfills.fail).toHaveBeenCalledWith(
      "kbf_job",
      "database unavailable",
      now().toISOString()
    );
    expect(deps.knowledgeBackfills.advance).not.toHaveBeenCalled();
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
  });

  it("validates batch bounds before touching persistence", async () => {
    const deps = dependencies();
    await expect(
      runKnowledgeBackfillBatch(
        { jobKey: "kbf_job", kind: "content_versions", batchSize: 101 },
        deps
      )
    ).rejects.toThrow("between 1 and 100");
    expect(deps.knowledgeBackfills.find).not.toHaveBeenCalled();
  });

  it("ignores a stale queue redelivery whose expected cursor was already advanced", async () => {
    const current = checkpoint({ status: "running", cursor: "cursor-new", processedCount: 2 });
    const deps = dependencies(current);
    await expect(
      runKnowledgeBackfillBatch(
        {
          jobKey: "kbf_job",
          kind: "content_versions",
          batchSize: 1,
          expectedCursor: "cursor-old",
        },
        deps
      )
    ).resolves.toEqual(current);
    expect(deps.knowledgeBackfills.start).not.toHaveBeenCalled();
    expect(deps.contentVersions.listReadyCandidates).not.toHaveBeenCalled();
    expect(deps.knowledgeBackfills.advance).not.toHaveBeenCalled();
  });

  it("rejects missing checkpoints and mismatched checkpoint types", async () => {
    const missing = dependencies();
    jest.mocked(missing.knowledgeBackfills.find).mockResolvedValue(undefined);
    await expect(
      runKnowledgeBackfillBatch(
        { jobKey: "missing", kind: "content_versions", batchSize: 1 },
        missing
      )
    ).rejects.toThrow("does not exist");

    const mismatched = dependencies(checkpoint({ jobType: "chunks" }));
    await expect(
      runKnowledgeBackfillBatch(
        { jobKey: "kbf_job", kind: "content_versions", batchSize: 1 },
        mismatched
      )
    ).rejects.toThrow("wrong type");
  });

  it("returns completed or concurrently unavailable checkpoints without running a batch", async () => {
    const completed = checkpoint({ status: "completed" });
    const completedDeps = dependencies(completed);
    await expect(
      runKnowledgeBackfillBatch(
        { jobKey: "kbf_job", kind: "content_versions", batchSize: 1 },
        completedDeps
      )
    ).resolves.toEqual(completed);
    expect(completedDeps.knowledgeBackfills.start).not.toHaveBeenCalled();

    const unavailableDeps = dependencies();
    jest.mocked(unavailableDeps.knowledgeBackfills.start).mockResolvedValue(undefined);
    await expect(
      runKnowledgeBackfillBatch(
        { jobKey: "kbf_job", kind: "content_versions", batchSize: 1 },
        unavailableDeps
      )
    ).resolves.toEqual(expect.objectContaining({ status: "pending" }));
    expect(unavailableDeps.contentVersions.listReadyCandidates).not.toHaveBeenCalled();
  });
});
