import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { ResearchRunMessageV1 } from "@/lib/contracts/tenant-jobs";
import { getTenantRepositories } from "@/lib/database";
import { dispatchResearchStage, runResearchStage } from "@/lib/ai/research";
import { aiLogger } from "@/lib/logger";
import type { ResearchDispatcher } from "@/lib/queue/dispatchers";
import { resolveResearchDispatcher } from "@/lib/queue/research-dispatch";

export const RESEARCH_QUEUE_ACTOR_ID = "00000000-0000-4000-8000-000000000006";

export type ResearchMessageConsumer = (message: ResearchRunMessageV1) => Promise<void>;

/**
 * Processes one validated research stage message: runs the first unfinished
 * stage of the report under a tenant-scoped repository set and publishes the
 * following stage. Shared by the Vercel Queue callback route and the local
 * inline dispatcher. A retryable stage failure propagates so the queue
 * redelivers the same message; the stage runner bounds attempts.
 */
export async function consumeResearchRunMessage(
  message: ResearchRunMessageV1,
  dispatcher?: ResearchDispatcher
): Promise<void> {
  const context = createAuthContext({
    userId: message.userId,
    actorKind: "system",
    actorId: RESEARCH_QUEUE_ACTOR_ID,
    requestId: message.traceId,
  });
  const repositories = await getTenantRepositories(context);
  const result = await runResearchStage({ context, repositories, reportId: message.reportId });
  if (result.outcome === "skipped") {
    aiLogger.info(
      {
        event: "research_stage_skipped",
        jobId: message.reportId,
        operation: message.step,
        code: result.reason,
        traceId: message.traceId,
      },
      "Research stage skipped"
    );
    return;
  }
  if (!result.next) return;
  await dispatchResearchStage(
    dispatcher ?? (await resolveResearchDispatcher()),
    context,
    message.reportId,
    result.next
  );
}
