/**
 * Job queue worker — polls the job_queue table and executes jobs.
 *
 * Uses SQLite-backed queue (no Redis needed for single-user app).
 * Polls every N seconds, dequeues one job at a time, executes handler.
 *
 * SERVER-SIDE ONLY.
 */

import { aiLogger } from "@/lib/logger";

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * Register a custom job handler.
 */
export function registerJobHandler(type: string, handler: JobHandler): void {
  void type;
  void handler;
  throw new Error("Legacy global job handlers are disabled pending tenant-scoped dequeue");
}

/**
 * Process a single job from the queue.
 * Returns true if a job was processed, false if queue was empty.
 */
export async function processNextJob(workerId = "main"): Promise<boolean> {
  // A global dequeue has no authenticated tenant capability. Leave queued work
  // untouched until the tenant-scoped worker contract is introduced.
  aiLogger.warn({ workerId }, "Legacy global job worker is disabled pending tenant-scoped dequeue");
  return false;
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
  throw new Error(`Tenant-scoped job enqueue is required for ${itemId}`);
}

/**
 * Helper to enqueue a proactive research scan.
 */
export async function enqueueProactiveScan(): Promise<void> {
  throw new Error("Tenant-scoped job enqueue is required");
}
