/**
 * Job queue worker — polls the job_queue table and executes jobs.
 *
 * Uses SQLite-backed queue (no Redis needed for single-user app).
 * Polls every N seconds, dequeues one job at a time, executes handler.
 *
 * SERVER-SIDE ONLY.
 */

import { dequeueJob, completeJob, enqueueJob } from "@/lib/database";
import { aiLogger } from "@/lib/logger";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import {
  actorIdSchema,
  createAuthContext,
  requestIdSchema,
  userIdSchema,
} from "@/lib/contracts/tenant-context";

function tenantJobContext(payload: Record<string, unknown>) {
  return createAuthContext({
    userId: userIdSchema.parse(payload.userId),
    actorKind: "system",
    actorId: actorIdSchema.parse(process.env.DISTIL_SYSTEM_ACTOR_ID ?? ""),
    requestId: requestIdSchema.parse(payload.traceId),
  });
}

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const jobHandlers = new Map<string, JobHandler>();

// Register built-in job handlers
jobHandlers.set("triage", async (payload) => {
  const { itemId } = payload as { itemId: string };
  if (!itemId) throw new Error("triage job requires itemId");
  const { runTriageWorkflow } = await import("@/lib/agent/workflows/triage");
  await runTriageWorkflow(itemId);
});

jobHandlers.set("generate_summary", async (payload) => {
  const { itemId, length } = payload as { itemId: string; length?: string };
  if (!itemId) throw new Error("generate_summary job requires itemId");
  const { generateSummary } = await import("@/lib/ai/summarize");
  await generateSummary(itemId, {
    length: (length as "brief" | "detailed") ?? "brief",
  });
});

jobHandlers.set("embed_item", async (payload) => {
  const { itemId, title, summary } = payload as {
    itemId: string;
    title: string;
    summary: string;
  };
  if (!itemId) throw new Error("embed_item job requires itemId");
  const { embedItem } = await import("@/lib/ai/embeddings");
  await embedItem(itemId, title, summary);
});

jobHandlers.set("proactive_research_scan", async () => {
  const { runProactiveScan } = await import("@/lib/agent/proactive-research");
  await runProactiveScan();
});

jobHandlers.set("cross_source_insight", async (payload) => {
  const { itemId } = payload as { itemId: string };
  if (!itemId) throw new Error("cross_source_insight job requires itemId");
  const { detectInsights } = await import("@/lib/agent/insight-detection");
  await detectInsights(itemId);
});

// Phase 2 jobs are registered with the same durable queue as the existing
// workflows. Imports stay inside handlers so disabled features add no startup
// work and never trigger a provider call.
jobHandlers.set("knowledge_backfill", async (payload) => {
  const [{ getTenantRepositories }, { createKnowledgeBackfillJobHandler }] = await Promise.all([
    import("@/lib/database"),
    import("@/lib/knowledge/jobs"),
  ]);
  const context = tenantJobContext(payload);
  await createKnowledgeBackfillJobHandler(context, await getTenantRepositories(context))(payload);
});

jobHandlers.set("regenerate_intelligence_summary", async (payload) => {
  const [{ getTenantRepositories }, { createIntelligenceSummaryJobHandler }] = await Promise.all([
    import("@/lib/database"),
    import("@/lib/knowledge/intelligence-runtime"),
  ]);
  const context = tenantJobContext(payload);
  await createIntelligenceSummaryJobHandler(context, await getTenantRepositories(context))(payload);
});

jobHandlers.set("digest_run", async (payload) => {
  if (!readPhase2FeatureFlags().digests) return;
  const [{ getTenantRepositories }, { createDigestJobHandler }] = await Promise.all([
    import("@/lib/database"),
    import("@/lib/digests/runtime"),
  ]);
  const context = tenantJobContext(payload);
  const repositories = await getTenantRepositories(context);
  await createDigestJobHandler(context, repositories.digestExperience)(payload);
});

/**
 * Register a custom job handler.
 */
export function registerJobHandler(type: string, handler: JobHandler): void {
  jobHandlers.set(type, handler);
}

/**
 * Process a single job from the queue.
 * Returns true if a job was processed, false if queue was empty.
 */
export async function processNextJob(workerId = "main"): Promise<boolean> {
  const job = await dequeueJob(workerId);
  if (!job) return false;

  const jobType = job.job_type as string;
  const jobId = job.id as string;
  const handler = jobHandlers.get(jobType);

  if (!handler) {
    aiLogger.error({ jobId, jobType }, "No handler registered for job type");
    await completeJob(jobId, `No handler for job type: ${jobType}`);
    return true;
  }

  try {
    const payload =
      typeof job.payload === "string" ? JSON.parse(job.payload || "{}") : (job.payload ?? {});
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("Job payload must be a JSON object");
    }
    await handler(payload);
    await completeJob(jobId);
    aiLogger.info({ jobId, jobType }, "Job completed successfully");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await completeJob(jobId, errMsg);
    aiLogger.error({ jobId, jobType, err: error }, "Job failed");
  }

  return true;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start polling the job queue.
 */
export function startJobWorker(intervalMs = 5000): void {
  if (pollInterval) return; // Already running

  aiLogger.info({ intervalMs }, "Job worker started");

  pollInterval = setInterval(async () => {
    try {
      let processed = true;
      while (processed) {
        processed = await processNextJob();
      }
    } catch (error) {
      aiLogger.error({ err: error }, "Job worker poll error");
    }
  }, intervalMs);

  // Don't prevent process exit
  pollInterval.unref();
}

/**
 * Stop the job worker.
 */
export function stopJobWorker(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    aiLogger.info("Job worker stopped");
  }
}

/**
 * Helper to enqueue a triage job.
 */
export async function enqueueTriageJob(itemId: string): Promise<void> {
  await enqueueJob({
    id: crypto.randomUUID(),
    jobType: "triage",
    payload: JSON.stringify({ itemId }),
    priority: 5,
  });
}

/**
 * Helper to enqueue a proactive research scan.
 */
export async function enqueueProactiveScan(): Promise<void> {
  await enqueueJob({
    id: crypto.randomUUID(),
    jobType: "proactive_research_scan",
    payload: "{}",
    priority: 1,
  });
}
