/**
 * Job queue worker — polls the job_queue table and executes jobs.
 *
 * Uses SQLite-backed queue (no Redis needed for single-user app).
 * Polls every N seconds, dequeues one job at a time, executes handler.
 *
 * SERVER-SIDE ONLY.
 */

import { dequeueJob, completeJob, enqueueJob } from "@/lib/db";
import { aiLogger } from "@/lib/logger";

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
  const job = dequeueJob(workerId);
  if (!job) return false;

  const jobType = job.job_type as string;
  const jobId = job.id as string;
  const handler = jobHandlers.get(jobType);

  if (!handler) {
    aiLogger.error({ jobId, jobType }, "No handler registered for job type");
    completeJob(jobId, `No handler for job type: ${jobType}`);
    return true;
  }

  try {
    const payload = JSON.parse((job.payload as string) || "{}");
    await handler(payload);
    completeJob(jobId);
    aiLogger.info({ jobId, jobType }, "Job completed successfully");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    completeJob(jobId, errMsg);
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
export function enqueueTriageJob(itemId: string): void {
  enqueueJob({
    id: crypto.randomUUID(),
    jobType: "triage",
    payload: JSON.stringify({ itemId }),
    priority: 5,
  });
}

/**
 * Helper to enqueue a proactive research scan.
 */
export function enqueueProactiveScan(): void {
  enqueueJob({
    id: crypto.randomUUID(),
    jobType: "proactive_research_scan",
    payload: "{}",
    priority: 1,
  });
}
