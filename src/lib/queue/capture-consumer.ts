import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";
import { createDefaultCaptureProcessor, CaptureWorker } from "@/lib/capture/worker";
import { getTenantRepositories } from "@/lib/database";
import { indexCapturedItem } from "@/lib/knowledge/capture-index";
import { createCaptureQueueConsumer } from "@/lib/queue/consumer";
import { generateSummary } from "@/lib/ai/summarize";
import { classifyItemArea } from "@/lib/ai/classify-area";
import { createTenantCaptureTriage } from "@/lib/ai/triage-capture";
import { CAPTURE_JUNK_ERROR_CODE } from "@/lib/contracts/capture-triage";
import type { CaptureRepository } from "@/lib/repositories/ports";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { aiLogger, sanitizeLogError } from "@/lib/logger";

export const CAPTURE_QUEUE_ACTOR_ID = "00000000-0000-4000-8000-000000000002";

export type CaptureMessageConsumer = (message: CaptureQueueMessageV2) => Promise<void>;

/** Recent rejected captures scanned for an earlier junk verdict on the same URL. */
const PRIOR_JUNK_SCAN_LIMIT = 100;

/**
 * True when another capture of this URL was rejected as junk. Saving it again is
 * then the user's "save anyway", so triage must not reject it a second time.
 */
export async function hasPriorJunkRejection(
  captures: Pick<CaptureRepository, "list">,
  normalizedUrl: string,
  captureId: string
): Promise<boolean> {
  const rejected = await captures.list(PRIOR_JUNK_SCAN_LIMIT, ["rejected"]);
  return rejected.some(
    (capture) =>
      capture.lastErrorCode === CAPTURE_JUNK_ERROR_CODE &&
      capture.normalizedUrl === normalizedUrl &&
      capture.id !== captureId
  );
}

/**
 * Processes one validated capture message end to end. Shared by the Vercel
 * Queue callback route and the local inline dispatcher so both paths run the
 * same worker, processor and knowledge indexing.
 */
export async function consumeCaptureMessage(message: CaptureQueueMessageV2): Promise<void> {
  const context = createAuthContext({
    userId: message.userId,
    actorKind: "system",
    actorId: CAPTURE_QUEUE_ACTOR_ID,
    requestId: message.traceId,
  });
  const repositories = await getTenantRepositories(context);
  const flags = readPhase2FeatureFlags();
  const worker = new CaptureWorker({
    context,
    captures: repositories.captures,
    processor: createDefaultCaptureProcessor({
      context,
      items: repositories.items,
      rawContent: repositories.rawContent,
      triage:
        flags.captureTriage !== "off"
          ? createTenantCaptureTriage(context, repositories)
          : undefined,
      triageMode: flags.captureTriage,
      hasPriorJunkRejection: (normalizedUrl, captureId) =>
        hasPriorJunkRejection(repositories.captures, normalizedUrl, captureId),
      enqueueEnrichment: async (itemId) => {
        await indexCapturedItem({ context, repositories, itemId });
        if (flags.captureSummary) {
          try {
            await generateSummary(context, repositories, itemId, { length: "brief" });
          } catch (error) {
            aiLogger.warn(
              {
                event: "capture_summary_skipped",
                traceId: context.requestId,
                err: sanitizeLogError(error),
              },
              "Capture summary generation skipped"
            );
          }
        }
        // After the brief, so the classifier can read it; independent of it, so an item
        // still gets an area when the brief is disabled or fails. A failure leaves the
        // item unclassified for the backfill and never fails the capture.
        if (flags.areaClassification) {
          try {
            await classifyItemArea(context, repositories, itemId);
          } catch (error) {
            aiLogger.warn(
              {
                event: "capture_area_skipped",
                traceId: context.requestId,
                err: sanitizeLogError(error),
              },
              "Capture area classification skipped"
            );
          }
        }
      },
    }),
    audit: async ({ action, traceId }) => {
      await repositories.agent.insertAuditLog({ id: crypto.randomUUID(), action, traceId });
    },
  });
  await createCaptureQueueConsumer(worker)(message);
}
