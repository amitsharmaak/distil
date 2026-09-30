jest.mock("@/lib/ai/classify-area", () => ({
  classifyItemArea: jest.fn(),
  loadAreaExamples: jest.fn(async () => []),
}));

import { AIProviderError } from "@/lib/ai/errors";
import { AIQuotaExceededError } from "@/lib/ai/router";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { jobIdSchema } from "@/lib/contracts/tenant-jobs";
import { FakeTenantJobDispatcher } from "@/lib/queue/dispatchers";
import type { AreaCounts, JobQueueSummary } from "@/lib/repositories/ports";
import type { LifeArea } from "@/lib/types";

import {
  AREA_BACKFILL_JOB_TYPE,
  areaBackfillJobId,
  areaBackfillPayloadSchema,
  createAreaBackfillJobHandler,
  emptyAreaTotals,
  getAreaBackfillOverview,
  listAreaBackfillRuns,
  runAreaBackfillBatch,
  startAreaBackfill,
  type AreaBackfillPayload,
} from "../area-backfill";

const userId = "10000000-0000-4000-8000-000000000001";
const context = createAuthContext({
  userId,
  actorKind: "system",
  actorId: "00000000-0000-4000-8000-000000000003",
  requestId: "30000000-0000-4000-8000-000000000001",
});
const runId = "40000000-0000-4000-8000-000000000001";

interface FakeItem {
  id: string;
  status: "ready" | "processing" | "rejected";
  area?: LifeArea;
  manualArea?: LifeArea;
}

/** In-memory tenant: the candidate query mirrors the PostgreSQL one. */
function fakeTenant(items: FakeItem[]) {
  const jobs: Array<JobQueueSummary & { idempotencyKey: string }> = [];
  const candidates = ({ afterId, limit }: { afterId?: string; limit: number }) =>
    items
      .filter((item) => item.status === "ready" && !item.area && !item.manualArea)
      .map((item) => item.id)
      .filter((id) => afterId === undefined || id > afterId)
      .sort()
      .slice(0, limit);
  const repositories = {
    items: {
      listAreaBackfillCandidates: jest.fn(async (input: { afterId?: string; limit: number }) =>
        candidates(input)
      ),
      countAreas: jest.fn(async (): Promise<AreaCounts> => {
        const counts: AreaCounts = {
          byArea: { personal: 0, work: 0, learning: 0, updates: 0 },
          unclassified: 0,
          corrected: 0,
        };
        for (const item of items.filter((entry) => entry.status === "ready")) {
          const area = item.manualArea ?? item.area;
          if (item.manualArea) counts.corrected += 1;
          if (area) counts.byArea[area] += 1;
          else counts.unclassified += 1;
        }
        return counts;
      }),
    },
    jobs: {
      enqueue: jest.fn(async (input: { id: string; idempotencyKey?: string; payload?: string }) => {
        if (jobs.some((job) => job.idempotencyKey === input.idempotencyKey)) return;
        jobs.unshift({
          id: input.id,
          idempotencyKey: input.idempotencyKey ?? input.id,
          status: "pending",
          attempts: 0,
          payload: JSON.parse(input.payload ?? "{}"),
          createdAt: new Date(Date.now() + jobs.length).toISOString(),
          updatedAt: new Date(Date.now() + jobs.length).toISOString(),
        });
      }),
      recordResult: jest.fn(async (id: string, result: Record<string, unknown>) => {
        const job = jobs.find((entry) => entry.id === id);
        if (job) {
          job.payload = { ...job.payload, result };
          job.status = "completed";
        }
      }),
      listRecentByType: jest.fn(async (_type: string, limit: number) => jobs.slice(0, limit)),
    },
  };
  return { items, jobs, repositories, repos: repositories as never };
}

const { classifyItemArea } = jest.requireMock("@/lib/ai/classify-area") as {
  classifyItemArea: jest.Mock;
};

/** The fake classifier: stores `area` on the item, like `setAiArea`. */
function classifyInto(items: FakeItem[], area: LifeArea = "learning") {
  classifyItemArea.mockImplementation(async (_context, _repos, itemId: string) => {
    const item = items.find((entry) => entry.id === itemId)!;
    if (item.manualArea) return { status: "skipped", reason: "manually-set" };
    if (item.area) return { status: "skipped", reason: "already-classified" };
    item.area = area;
    return { status: "classified", area, confidence: 0.9 };
  });
}

function payload(patch: Partial<AreaBackfillPayload> = {}): AreaBackfillPayload {
  return {
    jobId: areaBackfillJobId(runId, 0),
    runId,
    batchIndex: 0,
    batchSize: 20,
    maxBatches: 100,
    afterId: null,
    totals: emptyAreaTotals(),
    ...patch,
  };
}

function readyItems(count: number): FakeItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${String(index + 1).padStart(2, "0")}`,
    status: "ready" as const,
  }));
}

/** Runs a whole backfill by draining the chained jobs the way the queue would. */
async function drain(tenant: ReturnType<typeof fakeTenant>, first: AreaBackfillPayload) {
  const dispatcher = new FakeTenantJobDispatcher();
  const results = [];
  let next: AreaBackfillPayload | undefined = first;
  while (next) {
    const result = await runAreaBackfillBatch(context, tenant.repos, next, { dispatcher });
    results.push(result);
    const job = tenant.jobs.find((entry) => entry.id === result.nextJobId);
    next = job ? areaBackfillPayloadSchema.parse(job.payload) : undefined;
  }
  return { results, dispatcher };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("area backfill job", () => {
  it("skips items that are already classified or were set by hand", async () => {
    const items: FakeItem[] = [
      { id: "a", status: "ready", area: "work" },
      { id: "b", status: "ready", manualArea: "personal" },
      { id: "c", status: "ready" },
      { id: "d", status: "rejected" },
      { id: "e", status: "processing" },
    ];
    const tenant = fakeTenant(items);
    classifyInto(items);

    const result = await runAreaBackfillBatch(context, tenant.repos, payload());

    expect(classifyItemArea).toHaveBeenCalledTimes(1);
    expect(classifyItemArea).toHaveBeenCalledWith(context, tenant.repos, "c", {
      input: "title-summary",
      examples: [],
      skipManual: true,
    });
    expect(result).toMatchObject({
      status: "completed",
      batch: { classified: 1, skipped: 0, failed: 0, byArea: { learning: 1 } },
    });
    expect(items.find((item) => item.id === "a")?.area).toBe("work");
    expect(items.find((item) => item.id === "b")?.area).toBeUndefined();
  });

  it("counts an item the classifier skips (for example a correction made mid-run)", async () => {
    const items = readyItems(2);
    const tenant = fakeTenant(items);
    classifyItemArea
      .mockResolvedValueOnce({ status: "skipped", reason: "manually-set" })
      .mockResolvedValueOnce({ status: "classified", area: "updates", confidence: 0.8 });

    const result = await runAreaBackfillBatch(context, tenant.repos, payload());

    expect(result.batch).toEqual({
      classified: 1,
      skipped: 1,
      failed: 0,
      byArea: { personal: 0, work: 0, learning: 0, updates: 1 },
    });
  });

  it("respects the batch size and chains the next batch as a new tenant job", async () => {
    const items = readyItems(5);
    const tenant = fakeTenant(items);
    classifyInto(items, "work");
    const dispatcher = new FakeTenantJobDispatcher();

    const first = await runAreaBackfillBatch(context, tenant.repos, payload({ batchSize: 2 }), {
      dispatcher,
    });

    expect(classifyItemArea).toHaveBeenCalledTimes(2);
    expect(tenant.repositories.items.listAreaBackfillCandidates).toHaveBeenCalledWith({
      afterId: undefined,
      limit: 2,
    });
    expect(first.status).toBe("continued");
    expect(first.nextJobId).toBe(areaBackfillJobId(runId, 1));
    expect(dispatcher.messages).toEqual([
      {
        message: expect.objectContaining({
          userId,
          jobId: areaBackfillJobId(runId, 1),
          jobType: AREA_BACKFILL_JOB_TYPE,
        }),
        idempotencyKey: `area-backfill:${runId}:1`,
      },
    ]);
    const next = areaBackfillPayloadSchema.parse(
      tenant.jobs.find((job) => job.id === first.nextJobId)!.payload
    );
    expect(next).toMatchObject({
      batchIndex: 1,
      batchSize: 2,
      afterId: "item-02",
      totals: { classified: 2, byArea: { work: 2 } },
    });

    const { results } = await drain(tenant, next);
    expect(results.map((result) => result.status)).toEqual(["continued", "completed"]);
    expect(results.at(-1)?.totals).toMatchObject({ classified: 5, failed: 0 });
    expect(classifyItemArea).toHaveBeenCalledTimes(5);
    expect(items.every((item) => item.area === "work")).toBe(true);
  });

  it("counts a failed item, keeps going, and leaves it for the next run", async () => {
    const items = readyItems(4);
    const tenant = fakeTenant(items);
    classifyInto(items, "personal");
    const classify = classifyItemArea.getMockImplementation()!;
    classifyItemArea.mockImplementation(async (ctx, repos, itemId: string, options) => {
      if (itemId === "item-02") throw new AIProviderError("invalid_output", "gemini", "m");
      return classify(ctx, repos, itemId, options);
    });

    const { results } = await drain(tenant, payload({ batchSize: 2 }));

    // The cursor moves past the failure, so one run never retries it.
    expect(classifyItemArea.mock.calls.filter(([, , id]) => id === "item-02")).toHaveLength(1);
    expect(results.at(-1)?.status).toBe("completed");
    expect(results.at(-1)?.totals).toMatchObject({ classified: 3, failed: 1 });
    expect(await tenant.repositories.items.countAreas()).toMatchObject({ unclassified: 1 });

    // A second run finds only the item that failed.
    classifyItemArea.mockImplementation(classify);
    const rerun = await runAreaBackfillBatch(
      context,
      tenant.repos,
      payload({ runId: "40000000-0000-4000-8000-000000000002" })
    );
    expect(rerun.batch).toMatchObject({ classified: 1, failed: 0 });
    expect(await tenant.repositories.items.countAreas()).toMatchObject({ unclassified: 0 });
  });

  it("resumes after a crashed batch without paying for finished items again", async () => {
    const items = readyItems(3);
    const tenant = fakeTenant(items);
    classifyInto(items, "learning");
    const handler = createAreaBackfillJobHandler(async () => new FakeTenantJobDispatcher());
    tenant.repositories.jobs.recordResult.mockRejectedValueOnce(new Error("connection reset"));

    // First delivery classifies everything, then dies before it can finish.
    await expect(handler(context, payload(), tenant.repos)).rejects.toThrow("connection reset");
    expect(classifyItemArea).toHaveBeenCalledTimes(3);

    // Redelivery of the same payload: nothing is left, nothing is paid for twice.
    await handler(context, payload(), tenant.repos);
    expect(classifyItemArea).toHaveBeenCalledTimes(3);
    expect(items.every((item) => item.area === "learning")).toBe(true);
  });

  it("resumes the remainder when a batch dies part-way through", async () => {
    const items = readyItems(4);
    const tenant = fakeTenant(items);
    classifyInto(items, "updates");
    tenant.repositories.items.listAreaBackfillCandidates
      .mockImplementationOnce(async () => {
        // Two items are classified by an earlier, interrupted delivery.
        items[0].area = "updates";
        items[1].area = "updates";
        throw new Error("function timeout");
      })
      .mockImplementation(async (input) =>
        items
          .filter((item) => !item.area)
          .map((item) => item.id)
          .filter((id) => !input.afterId || id > input.afterId)
          .slice(0, input.limit)
      );

    await expect(runAreaBackfillBatch(context, tenant.repos, payload())).rejects.toThrow(
      "function timeout"
    );
    const retried = await runAreaBackfillBatch(context, tenant.repos, payload());

    expect(classifyItemArea.mock.calls.map(([, , id]) => id)).toEqual(["item-03", "item-04"]);
    expect(retried).toMatchObject({ status: "completed", batch: { classified: 2 } });
  });

  it("stops cleanly when the tenant AI budget is exhausted", async () => {
    const items = readyItems(4);
    const tenant = fakeTenant(items);
    classifyInto(items, "work");
    const classify = classifyItemArea.getMockImplementation()!;
    classifyItemArea.mockImplementation(async (ctx, repos, itemId: string, options) => {
      if (itemId === "item-02") throw new AIQuotaExceededError("daily");
      return classify(ctx, repos, itemId, options);
    });
    const dispatcher = new FakeTenantJobDispatcher();

    const result = await runAreaBackfillBatch(context, tenant.repos, payload({ batchSize: 2 }), {
      dispatcher,
    });

    expect(result).toMatchObject({
      status: "budget-exhausted",
      batch: { classified: 1, failed: 0 },
    });
    expect(result.nextJobId).toBeUndefined();
    expect(dispatcher.messages).toHaveLength(0);
    expect(tenant.repositories.jobs.enqueue).not.toHaveBeenCalled();
    expect(classifyItemArea).toHaveBeenCalledTimes(2);
    expect(tenant.repositories.jobs.recordResult).toHaveBeenCalledWith(
      payload().jobId,
      expect.objectContaining({ status: "budget-exhausted" })
    );
    expect(await tenant.repositories.items.countAreas()).toMatchObject({ unclassified: 3 });
  });

  it("treats a provider quota refusal as budget exhaustion too", async () => {
    const items = readyItems(2);
    const tenant = fakeTenant(items);
    classifyItemArea.mockRejectedValue(new AIProviderError("quota", "gemini", "m"));

    const result = await runAreaBackfillBatch(context, tenant.repos, payload());

    expect(result.status).toBe("budget-exhausted");
    expect(classifyItemArea).toHaveBeenCalledTimes(1);
  });

  it("stops at the time budget and chains the rest from the last finished item", async () => {
    const items = readyItems(5);
    const tenant = fakeTenant(items);
    classifyInto(items);
    let clock = 0;
    classifyItemArea.mockImplementation(async (_ctx, _repos, itemId: string) => {
      clock += 15_000;
      items.find((item) => item.id === itemId)!.area = "learning";
      return { status: "classified", area: "learning", confidence: 1 };
    });

    const result = await runAreaBackfillBatch(context, tenant.repos, payload(), {
      now: () => clock,
      timeBudgetMs: 40_000,
      dispatcher: new FakeTenantJobDispatcher(),
    });

    expect(result).toMatchObject({ status: "continued", batch: { classified: 3 } });
    const next = tenant.jobs.find((job) => job.id === result.nextJobId)!;
    expect(next.payload).toMatchObject({ afterId: "item-03", batchIndex: 1 });
  });

  it("stops after the maximum number of batches", async () => {
    const items = readyItems(3);
    const tenant = fakeTenant(items);
    classifyInto(items);

    const result = await runAreaBackfillBatch(
      context,
      tenant.repos,
      payload({ batchSize: 1, maxBatches: 1 })
    );

    expect(result.status).toBe("max-batches-reached");
    expect(tenant.repositories.jobs.enqueue).not.toHaveBeenCalled();
  });

  it("rejects a payload that does not match the strict schema", async () => {
    const tenant = fakeTenant(readyItems(1));
    const handler = createAreaBackfillJobHandler(async () => undefined);
    await expect(
      handler(context, { ...payload(), batchSize: 500 }, tenant.repos)
    ).rejects.toThrow();
    await expect(handler(context, { ...payload(), extra: 1 }, tenant.repos)).rejects.toThrow();
    expect(classifyItemArea).not.toHaveBeenCalled();
  });

  it("derives stable, valid job ids per run and batch", () => {
    expect(areaBackfillJobId(runId, 3)).toBe(areaBackfillJobId(runId, 3));
    expect(areaBackfillJobId(runId, 3)).not.toBe(areaBackfillJobId(runId, 4));
    expect(() => jobIdSchema.parse(areaBackfillJobId(runId, 0))).not.toThrow();
  });
});

describe("starting and observing a backfill", () => {
  it("does nothing when every item already has an area", async () => {
    const tenant = fakeTenant([{ id: "a", status: "ready", area: "work" }]);
    await expect(startAreaBackfill(context, tenant.repos)).resolves.toEqual({
      started: false,
      reason: "nothing-to-do",
    });
    expect(tenant.repositories.jobs.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues the first batch for the caller and refuses a second concurrent run", async () => {
    const tenant = fakeTenant(readyItems(3));
    const dispatcher = new FakeTenantJobDispatcher();

    const started = await startAreaBackfill(context, tenant.repos, { batchSize: 2, dispatcher });

    expect(started).toMatchObject({ started: true, unclassified: 3 });
    if (!started.started) throw new Error("expected a run");
    expect(started.jobId).toBe(areaBackfillJobId(started.runId, 0));
    expect(tenant.repositories.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId, jobType: AREA_BACKFILL_JOB_TYPE, maxRetries: 3 })
    );
    expect(dispatcher.messages[0].message).toMatchObject({ userId, jobId: started.jobId });

    await expect(startAreaBackfill(context, tenant.repos, { dispatcher })).resolves.toEqual({
      started: false,
      reason: "already-running",
      runId: started.runId,
    });
  });

  it("summarises runs and counts without any content", async () => {
    const items = readyItems(3);
    items.push({ id: "z", status: "ready", manualArea: "personal" });
    const tenant = fakeTenant(items);
    classifyInto(items, "work");
    const started = await startAreaBackfill(context, tenant.repos, { batchSize: 2 });
    if (!started.started) throw new Error("expected a run");
    await drain(tenant, areaBackfillPayloadSchema.parse(tenant.jobs[0].payload));

    const runs = await listAreaBackfillRuns(tenant.repos);
    expect(runs).toEqual([
      expect.objectContaining({
        runId: started.runId,
        status: "completed",
        batches: 2,
        totals: expect.objectContaining({ classified: 3, failed: 0 }),
      }),
    ]);
    const overview = await getAreaBackfillOverview(tenant.repos);
    expect(overview.counts).toEqual({
      byArea: { personal: 1, work: 3, learning: 0, updates: 0 },
      unclassified: 0,
      corrected: 1,
    });
    expect(JSON.stringify(overview)).not.toMatch(/item-0/);
  });
});
