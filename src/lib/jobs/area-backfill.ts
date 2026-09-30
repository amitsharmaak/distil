/**
 * Life-area backfill (inline search plan, phase F6).
 *
 * Classifies the tenant's existing items that have no area yet, one bounded
 * batch per tenant job, through the same `classifyItemArea` function and
 * `classify-area` task as capture, reading only title and summary (decision 7).
 *
 * - **Idempotent and resumable.** Progress is the items themselves: a
 *   classified item leaves the candidate set, so a redelivered batch or a new
 *   run picks up exactly the remainder. A run walks the candidates in id order
 *   with a cursor, so an item that fails is not retried inside the same run;
 *   the next run retries it.
 * - **Bounded.** Each job handles at most `batchSize` items and stops early
 *   when its time budget is spent, then enqueues the next batch as a new job.
 * - **Budget-aware.** When the tenant AI budget or the provider quota is
 *   exhausted the run stops cleanly and enqueues nothing more.
 * - **Tenant-scoped.** Every read and write goes through the envelope
 *   tenant's repositories; logs and stored results carry counts and ids only.
 *
 * SERVER-SIDE ONLY.
 */

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { classifyItemArea, loadAreaExamples } from "@/lib/ai/classify-area";
import { AIProviderError } from "@/lib/ai/errors";
import { AIQuotaExceededError } from "@/lib/ai/router";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import { enqueueTenantJob, type TenantJobHandler } from "@/lib/jobs/tenant-runtime";
import { aiLogger, sanitizeLogError } from "@/lib/logger";
import type { TenantJobDispatcher } from "@/lib/queue/dispatchers";
import type { AreaCounts, RepositorySet } from "@/lib/repositories/ports";
import { LIFE_AREAS, type LifeArea } from "@/lib/types";

export const AREA_BACKFILL_JOB_TYPE = "items.area-backfill";
export const AREA_BACKFILL_DEFAULT_BATCH_SIZE = 20;
export const AREA_BACKFILL_MAX_BATCH_SIZE = 50;
export const AREA_BACKFILL_DEFAULT_MAX_BATCHES = 100;
/** The queue callback may run 60 s; leave room for the last call and the chaining writes. */
export const AREA_BACKFILL_TIME_BUDGET_MS = 40_000;
/** A run whose latest batch has not moved for this long is treated as stalled, not active. */
const ACTIVE_RUN_WINDOW_MS = 10 * 60_000;

const areaTotalsSchema = z
  .object({
    classified: z.number().int().min(0),
    skipped: z.number().int().min(0),
    failed: z.number().int().min(0),
    byArea: z
      .object({
        personal: z.number().int().min(0),
        work: z.number().int().min(0),
        learning: z.number().int().min(0),
        updates: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type AreaBackfillTotals = z.infer<typeof areaTotalsSchema>;

export const areaBackfillPayloadSchema = z
  .object({
    jobId: z.string().uuid(),
    runId: z.string().uuid(),
    batchIndex: z.number().int().min(0),
    batchSize: z.number().int().min(1).max(AREA_BACKFILL_MAX_BATCH_SIZE),
    maxBatches: z.number().int().min(1).max(1_000),
    afterId: z.string().min(1).max(200).nullable(),
    totals: areaTotalsSchema,
    // Written back by `recordResult` once the batch finishes; ignored on input.
    result: z.unknown().optional(),
  })
  .strict();

export type AreaBackfillPayload = z.infer<typeof areaBackfillPayloadSchema>;

export type AreaBackfillStatus =
  | "continued"
  | "completed"
  | "budget-exhausted"
  | "max-batches-reached";

export interface AreaBackfillBatchResult {
  status: AreaBackfillStatus;
  runId: string;
  batchIndex: number;
  /** Counts for this batch only. */
  batch: AreaBackfillTotals;
  /** Counts for the whole run so far, this batch included. */
  totals: AreaBackfillTotals;
  nextJobId?: string;
}

export interface AreaBackfillDependencies {
  dispatcher?: TenantJobDispatcher;
  classify?: typeof classifyItemArea;
  now?: () => number;
  timeBudgetMs?: number;
}

export function emptyAreaTotals(): AreaBackfillTotals {
  return {
    classified: 0,
    skipped: 0,
    failed: 0,
    byArea: { personal: 0, work: 0, learning: 0, updates: 0 },
  };
}

function addTotals(a: AreaBackfillTotals, b: AreaBackfillTotals): AreaBackfillTotals {
  const byArea = { ...a.byArea };
  for (const area of LIFE_AREAS) byArea[area] += b.byArea[area];
  return {
    classified: a.classified + b.classified,
    skipped: a.skipped + b.skipped,
    failed: a.failed + b.failed,
    byArea,
  };
}

/**
 * The job id of batch `batchIndex` of a run, derived rather than random so a
 * redelivered batch re-enqueues the same next job instead of a second one.
 */
export function areaBackfillJobId(runId: string, batchIndex: number): string {
  const hex = createHash("sha256").update(`area-backfill:${runId}:${batchIndex}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Budget or quota exhaustion ends the run; any other failure is one failed item. */
export function isBudgetExhausted(error: unknown): boolean {
  if (error instanceof AIQuotaExceededError) return true;
  return (
    error instanceof AIProviderError && (error.category === "budget" || error.category === "quota")
  );
}

function jobInput(payload: AreaBackfillPayload) {
  return {
    jobId: payload.jobId,
    jobType: AREA_BACKFILL_JOB_TYPE,
    idempotencyKey: `area-backfill:${payload.runId}:${payload.batchIndex}`,
    payload: payload as unknown as Record<string, unknown>,
    maxRetries: 3,
  };
}

/** Runs one batch of a backfill run and chains the next batch when items remain. */
export async function runAreaBackfillBatch(
  context: AuthContext,
  repositories: RepositorySet,
  payload: AreaBackfillPayload,
  dependencies: AreaBackfillDependencies = {}
): Promise<AreaBackfillBatchResult> {
  const classify = dependencies.classify ?? classifyItemArea;
  const now = dependencies.now ?? Date.now;
  const timeBudgetMs = dependencies.timeBudgetMs ?? AREA_BACKFILL_TIME_BUDGET_MS;
  const startedAt = now();

  const candidates = await repositories.items.listAreaBackfillCandidates({
    afterId: payload.afterId ?? undefined,
    limit: payload.batchSize,
  });
  const examples = candidates.length ? await loadAreaExamples(repositories) : [];
  const batch = emptyAreaTotals();
  let cursor = payload.afterId;
  let processed = 0;
  let budgetExhausted = false;

  for (const itemId of candidates) {
    if (processed > 0 && now() - startedAt >= timeBudgetMs) break;
    try {
      const outcome = await classify(context, repositories, itemId, {
        input: "title-summary",
        examples,
        skipManual: true,
      });
      if (outcome.status === "classified") {
        batch.classified += 1;
        batch.byArea[outcome.area as LifeArea] += 1;
      } else {
        batch.skipped += 1;
      }
    } catch (error) {
      if (isBudgetExhausted(error)) {
        // The item stays unclassified and the cursor stays before it.
        budgetExhausted = true;
        break;
      }
      batch.failed += 1;
      aiLogger.warn(
        {
          event: "area_backfill_item_failed",
          traceId: context.requestId,
          runId: payload.runId,
          itemId,
          err: sanitizeLogError(error),
        },
        "Area backfill item failed"
      );
    }
    cursor = itemId;
    processed += 1;
  }

  const totals = addTotals(payload.totals, batch);
  const moreRemain = processed < candidates.length || candidates.length === payload.batchSize;
  let status: AreaBackfillStatus;
  let nextJobId: string | undefined;
  if (budgetExhausted) status = "budget-exhausted";
  else if (!moreRemain) status = "completed";
  else if (payload.batchIndex + 1 >= payload.maxBatches) status = "max-batches-reached";
  else {
    status = "continued";
    const next: AreaBackfillPayload = {
      jobId: areaBackfillJobId(payload.runId, payload.batchIndex + 1),
      runId: payload.runId,
      batchIndex: payload.batchIndex + 1,
      batchSize: payload.batchSize,
      maxBatches: payload.maxBatches,
      afterId: cursor,
      totals,
    };
    nextJobId = next.jobId;
    await enqueueTenantJob(context, repositories, {
      ...jobInput(next),
      dispatcher: dependencies.dispatcher,
    });
  }

  const result: AreaBackfillBatchResult = {
    status,
    runId: payload.runId,
    batchIndex: payload.batchIndex,
    batch,
    totals,
    ...(nextJobId ? { nextJobId } : {}),
  };
  await repositories.jobs.recordResult?.(payload.jobId, {
    status,
    batch,
    totals,
    finishedAt: new Date(now()).toISOString(),
  });
  aiLogger.info(
    {
      event: "area_backfill_batch",
      traceId: context.requestId,
      runId: payload.runId,
      batchIndex: payload.batchIndex,
      status,
      candidates: candidates.length,
      classified: batch.classified,
      skipped: batch.skipped,
      failed: batch.failed,
      ...batch.byArea,
      totalClassified: totals.classified,
      totalSkipped: totals.skipped,
      totalFailed: totals.failed,
    },
    "Area backfill batch finished"
  );
  return result;
}

/** The tenant job handler registered for `items.area-backfill`. */
export function createAreaBackfillJobHandler(
  getDispatcher: () => Promise<TenantJobDispatcher | undefined>
): TenantJobHandler {
  return async (context, rawPayload, repositories) => {
    const payload = areaBackfillPayloadSchema.parse(rawPayload);
    await runAreaBackfillBatch(context, repositories, payload, {
      dispatcher: await getDispatcher(),
    });
  };
}

export interface AreaBackfillRunSummary {
  runId: string;
  status: AreaBackfillStatus | "queued" | "running" | "failed";
  batches: number;
  totals: AreaBackfillTotals;
  startedAt: string;
  updatedAt: string;
}

const recordedResultSchema = z
  .object({
    status: z.enum(["continued", "completed", "budget-exhausted", "max-batches-reached"]),
    totals: areaTotalsSchema,
  })
  .passthrough();

/** Recent runs, newest first, rebuilt from their batch jobs. Counts only. */
export async function listAreaBackfillRuns(
  repositories: RepositorySet,
  limit = 200
): Promise<AreaBackfillRunSummary[]> {
  const jobs = (await repositories.jobs.listRecentByType?.(AREA_BACKFILL_JOB_TYPE, limit)) ?? [];
  const runs = new Map<string, AreaBackfillRunSummary & { latestBatch: number }>();
  for (const job of jobs) {
    const payload = areaBackfillPayloadSchema.safeParse(job.payload);
    if (!payload.success) continue;
    const { runId, batchIndex } = payload.data;
    const recorded = recordedResultSchema.safeParse(payload.data.result);
    const status: AreaBackfillRunSummary["status"] = recorded.success
      ? recorded.data.status
      : job.status === "pending"
        ? "queued"
        : job.status === "failed"
          ? "failed"
          : "running";
    const totals = recorded.success ? recorded.data.totals : payload.data.totals;
    const existing = runs.get(runId);
    if (!existing) {
      runs.set(runId, {
        runId,
        status,
        batches: 1,
        totals,
        startedAt: job.createdAt,
        updatedAt: job.updatedAt,
        latestBatch: batchIndex,
      });
      continue;
    }
    existing.batches += 1;
    if (job.createdAt < existing.startedAt) existing.startedAt = job.createdAt;
    if (batchIndex > existing.latestBatch) {
      Object.assign(existing, {
        status,
        totals,
        updatedAt: job.updatedAt,
        latestBatch: batchIndex,
      });
    }
  }
  return [...runs.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((run) => {
      const summary: AreaBackfillRunSummary & { latestBatch?: number } = { ...run };
      delete summary.latestBatch;
      return summary;
    });
}

export interface AreaBackfillOverview {
  counts: AreaCounts;
  runs: AreaBackfillRunSummary[];
}

export async function getAreaBackfillOverview(
  repositories: RepositorySet
): Promise<AreaBackfillOverview> {
  const [counts, runs] = await Promise.all([
    repositories.items.countAreas(),
    listAreaBackfillRuns(repositories),
  ]);
  return { counts, runs: runs.slice(0, 10) };
}

export const startAreaBackfillSchema = z
  .object({
    batchSize: z.number().int().min(1).max(AREA_BACKFILL_MAX_BATCH_SIZE).optional(),
    maxBatches: z.number().int().min(1).max(1_000).optional(),
  })
  .strict();

export type StartAreaBackfillInput = z.infer<typeof startAreaBackfillSchema>;

export type StartAreaBackfillResult =
  | { started: true; runId: string; jobId: string; unclassified: number }
  | { started: false; reason: "nothing-to-do" | "already-running"; runId?: string };

/**
 * Starts a backfill run for the calling tenant. Refuses while another run is
 * still moving, so a double click cannot spend twice.
 */
export async function startAreaBackfill(
  context: AuthContext,
  repositories: RepositorySet,
  input: StartAreaBackfillInput & { dispatcher?: TenantJobDispatcher; now?: () => number } = {}
): Promise<StartAreaBackfillResult> {
  parseAuthContext(context);
  const now = input.now ?? Date.now;
  const runs = await listAreaBackfillRuns(repositories);
  const active = runs.find(
    (run) =>
      (run.status === "queued" || run.status === "running" || run.status === "continued") &&
      now() - Date.parse(run.updatedAt) < ACTIVE_RUN_WINDOW_MS
  );
  if (active) return { started: false, reason: "already-running", runId: active.runId };

  const counts = await repositories.items.countAreas();
  if (counts.unclassified === 0) return { started: false, reason: "nothing-to-do" };

  const runId = randomUUID();
  const payload: AreaBackfillPayload = {
    jobId: areaBackfillJobId(runId, 0),
    runId,
    batchIndex: 0,
    batchSize: input.batchSize ?? AREA_BACKFILL_DEFAULT_BATCH_SIZE,
    maxBatches: input.maxBatches ?? AREA_BACKFILL_DEFAULT_MAX_BATCHES,
    afterId: null,
    totals: emptyAreaTotals(),
  };
  await enqueueTenantJob(context, repositories, {
    ...jobInput(payload),
    dispatcher: input.dispatcher,
  });
  aiLogger.info(
    {
      event: "area_backfill_started",
      traceId: context.requestId,
      runId,
      unclassified: counts.unclassified,
      batchSize: payload.batchSize,
    },
    "Area backfill started"
  );
  return { started: true, runId, jobId: payload.jobId, unclassified: counts.unclassified };
}
