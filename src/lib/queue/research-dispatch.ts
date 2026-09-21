import { config } from "@/lib/config";
import { aiLogger, sanitizeLogError } from "@/lib/logger";
import {
  createVercelResearchDispatcher,
  InlineResearchDispatcher,
  type ResearchDispatcher,
} from "@/lib/queue/dispatchers";

/**
 * How research stages reach the worker. Follows the capture dispatch switch:
 * `queue` publishes to the Vercel Queue topic `research-runs`; `inline` runs
 * the same consumer inside the local `next dev` process, where no queue
 * credentials exist. Never `inline` on Vercel.
 */
export async function resolveResearchDispatcher(): Promise<ResearchDispatcher> {
  if (config.captureDispatch === "inline") {
    const { consumeResearchRunMessage } = await import("@/lib/queue/research-consumer");
    return new InlineResearchDispatcher(consumeResearchRunMessage, (error) => {
      aiLogger.error(
        { event: "research_inline_stage_failed", err: sanitizeLogError(error) },
        "inline research stage failed"
      );
    });
  }
  return createVercelResearchDispatcher();
}
