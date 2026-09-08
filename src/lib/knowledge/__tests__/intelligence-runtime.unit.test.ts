jest.mock("@/lib/logger", () => ({
  aiLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { IntelligenceArtifact } from "../artifacts";
import { aiLogger } from "@/lib/logger";
import type { RepositorySet } from "@/lib/repositories/ports";
import {
  runIntelligenceSummaryJob,
  type StructuredSummaryGenerator,
} from "../intelligence-runtime";
import { createAuthContext } from "@/lib/contracts/tenant-context";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "system",
  actorId: "20000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

const timestamp = "2026-09-07T12:00:00.000Z";
const source = "A durable queue persists accepted work before processing.";

function artifact(patch: Partial<IntelligenceArtifact> = {}): IntelligenceArtifact {
  return {
    id: "artifact-1",
    itemId: "item-1",
    contentVersionId: "version-1",
    artifactType: "brief_summary",
    version: 2,
    status: "pending",
    provenance: "generated",
    isCurrent: false,
    metadata: { jobId: "job-1" },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...patch,
  };
}

function repositories(
  prior?: IntelligenceArtifact,
  pendingPatch: Partial<IntelligenceArtifact> = {}
) {
  const pending = artifact(pendingPatch);
  const intelligenceArtifacts = {
    findById: jest.fn(async (id: string) => (id === pending.id ? pending : undefined)),
    findCurrent: jest.fn().mockResolvedValue(prior),
    listForItem: jest.fn(),
    publish: jest.fn(async (record) => ({
      record: { ...record, version: 1, isCurrent: false },
      created: true,
    })),
    updatePending: jest.fn(async (_id, patch) => ({ ...pending, ...patch })),
    complete: jest.fn(async (_id, completion) => ({ ...pending, ...completion })),
    listLegacySummaryCandidates: jest.fn(),
    listDegradedSummaryCandidates: jest.fn(),
  };
  const result = {
    items: { findById: jest.fn().mockResolvedValue({ id: "item-1", title: "Queues" }) },
    contentVersions: {
      findById: jest.fn().mockResolvedValue({
        id: "version-1",
        itemId: "item-1",
        content: source,
      }),
    },
    contentChunks: {
      listForContentVersion: jest.fn().mockResolvedValue([
        {
          id: "chunk-1",
          contentVersionId: "version-1",
          itemId: "item-1",
          ordinal: 0,
          content: source,
          contentHash: "hash",
          startOffset: 0,
          endOffset: source.length,
          tokenCount: 10,
          embeddingStatus: "unconfigured",
          createdAt: timestamp,
        },
      ]),
    },
    intelligenceArtifacts,
    claims: {
      listForArtifact: jest.fn().mockResolvedValue([]),
      insertWithEvidence: jest.fn(async (claims) => claims),
    },
    agent: {
      getDailyAuditStats: jest
        .fn()
        .mockResolvedValue({ totalCalls: 0, totalTokens: 0, totalCost: 0 }),
      getAuditStatsSince: jest
        .fn()
        .mockResolvedValue({ totalCalls: 0, totalTokens: 0, totalCost: 0 }),
    },
    lifecycle: {
      consumeUsage: jest.fn().mockResolvedValue({
        allowed: true,
        counter: {
          date: "2026-09-08",
          operation: "ai.requests",
          provider: "",
          requestCount: 1,
          inputTokens: 0,
          outputTokens: 0,
          costMicrousd: 0,
        },
      }),
    },
  } as unknown as RepositorySet;
  return { result, intelligenceArtifacts };
}

const payload = {
  userId: context.userId,
  itemId: "item-1",
  contentVersionId: "version-1",
  artifactId: "artifact-1",
  artifactType: "brief_summary" as const,
  jobId: "job-1",
  traceId: "trace-1",
};

function validGenerator(): StructuredSummaryGenerator {
  const startOffset = source.indexOf("durable queue");
  const exactExcerpt = "durable queue";
  return {
    generate: jest.fn().mockResolvedValue({
      provider: "test-provider",
      model: "test-model",
      output: {
        summary: "Accepted work is durably queued.",
        claims: [
          {
            claim: "The queue persists accepted work.",
            confidence: 0.95,
            evidence: [
              {
                chunkId: "chunk-1",
                startOffset,
                endOffset: startOffset + exactExcerpt.length,
                exactExcerpt,
              },
            ],
          },
        ],
      },
    }),
  };
}

describe("durable intelligence summary runtime", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    delete process.env.DISTIL_DAILY_AI_BUDGET;
    delete process.env.DISTIL_ROLLING_30D_AI_BUDGET;
  });

  it("validates citations and publishes claims before promoting the summary", async () => {
    const { result, intelligenceArtifacts } = repositories();
    const generator = validGenerator();
    await runIntelligenceSummaryJob(context, payload, result, {
      generator,
      now: () => new Date(timestamp),
    });

    expect(result.claims.insertWithEvidence).toHaveBeenCalledWith([
      expect.objectContaining({
        artifactId: expect.stringMatching(/^art_/),
        evidence: [expect.objectContaining({ exactExcerpt: "durable queue" })],
      }),
    ]);
    expect(intelligenceArtifacts.complete.mock.calls.at(-1)?.[1]).toMatchObject({
      status: "ready",
      makeCurrent: true,
      provider: "test-provider",
      model: "test-model",
      metadata: expect.objectContaining({
        jobId: "job-1",
        traceId: "trace-1",
        schemaVersion: "grounded-summary-schema-v1",
        attempt: 1,
      }),
    });
    expect(JSON.stringify(jest.mocked(aiLogger.info).mock.calls)).not.toContain(source);
  });

  it("returns an already completed artifact without touching sources or the provider", async () => {
    const { result } = repositories(undefined, { status: "ready", isCurrent: true });
    const generator = validGenerator();
    await expect(
      runIntelligenceSummaryJob(context, payload, result, { generator })
    ).resolves.toMatchObject({
      id: "artifact-1",
      status: "ready",
    });
    expect(result.items.findById).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("retries invalid grounded output twice, then preserves the previous current artifact", async () => {
    const current = artifact({ id: "artifact-current", status: "ready", isCurrent: true });
    const { result, intelligenceArtifacts } = repositories(current);
    const generator = {
      generate: jest.fn().mockResolvedValue({
        provider: "test-provider",
        model: "test-model",
        output: {
          summary: "Unsupported",
          claims: [
            {
              claim: "Unsupported",
              evidence: [
                { chunkId: "unknown", startOffset: 0, endOffset: 4, exactExcerpt: "fake" },
              ],
            },
          ],
        },
      }),
    };

    await runIntelligenceSummaryJob(context, payload, result, {
      generator,
      sleep: jest.fn().mockResolvedValue(undefined),
      random: () => 0,
    });

    expect(generator.generate).toHaveBeenCalledTimes(3);
    expect(intelligenceArtifacts.complete).toHaveBeenCalledWith(
      "artifact-1",
      expect.objectContaining({
        status: "failed",
        makeCurrent: false,
        errorCode: "invalid_output",
      })
    );
  });

  it("uses a deterministic degraded summary when no previous valid artifact exists", async () => {
    const { result, intelligenceArtifacts } = repositories();
    const generator = {
      generate: jest.fn().mockRejectedValue(new Error("credentials are not configured")),
    };
    await runIntelligenceSummaryJob(context, payload, result, { generator });
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(intelligenceArtifacts.complete).toHaveBeenCalledWith(
      "artifact-1",
      expect.objectContaining({
        status: "degraded",
        makeCurrent: true,
        content: expect.stringContaining("A durable queue persists accepted work"),
        errorCode: "provider_error",
      })
    );
  });

  it("does not hide storage failures as AI degradation", async () => {
    const { result, intelligenceArtifacts } = repositories();
    intelligenceArtifacts.updatePending.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      runIntelligenceSummaryJob(context, payload, result, { generator: validGenerator() })
    ).rejects.toThrow("database unavailable");
    expect(intelligenceArtifacts.complete).not.toHaveBeenCalled();
  });

  it("checks the database-backed budget before provider work", async () => {
    process.env.DISTIL_DAILY_AI_BUDGET = "1";
    const { result, intelligenceArtifacts } = repositories();
    jest.mocked(result.agent.getDailyAuditStats).mockResolvedValue({
      totalCalls: 1,
      totalTokens: 100,
      totalCost: 1,
    });
    const generator = validGenerator();
    await runIntelligenceSummaryJob(context, payload, result, { generator });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(intelligenceArtifacts.complete).toHaveBeenCalledWith(
      "artifact-1",
      expect.objectContaining({ status: "degraded", errorCode: "budget_exceeded" })
    );
  });

  it("keeps durable content and degrades cleanly when the tenant-local quota is exhausted", async () => {
    const { result, intelligenceArtifacts } = repositories();
    jest.mocked(result.lifecycle.consumeUsage).mockResolvedValueOnce({
      allowed: false,
      counter: {
        date: "2026-09-08",
        operation: "ai.requests",
        provider: "",
        requestCount: 10,
        inputTokens: 0,
        outputTokens: 0,
        costMicrousd: 0,
      },
      quota: { quotaKey: "ai.requests", period: "day", hardLimit: 10 },
    });
    const generator = validGenerator();

    await runIntelligenceSummaryJob(context, payload, result, { generator });

    expect(generator.generate).not.toHaveBeenCalled();
    expect(intelligenceArtifacts.complete).toHaveBeenCalledWith(
      "artifact-1",
      expect.objectContaining({ status: "degraded", errorCode: "budget_exceeded" })
    );
  });

  it("degrades without provider work when the tenant rolling budget is exhausted", async () => {
    process.env.DISTIL_ROLLING_30D_AI_BUDGET = "10";
    const { result, intelligenceArtifacts } = repositories();
    jest.mocked(result.agent.getAuditStatsSince).mockResolvedValue({
      totalCalls: 20,
      totalTokens: 5_000,
      totalCost: 10,
    });
    const generator = validGenerator();

    await runIntelligenceSummaryJob(context, payload, result, { generator });

    expect(result.agent.getAuditStatsSince).toHaveBeenCalledWith(expect.any(String));
    expect(generator.generate).not.toHaveBeenCalled();
    expect(intelligenceArtifacts.complete).toHaveBeenCalledWith(
      "artifact-1",
      expect.objectContaining({ status: "degraded", errorCode: "budget_exceeded" })
    );
  });
});
