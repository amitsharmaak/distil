import { handleCallback } from "@vercel/queue";

import { ResearchStageRetryError } from "@/lib/ai/research";
import { parseResearchRunMessageV1 } from "@/lib/contracts/tenant-jobs";
import {
  consumeResearchRunMessage,
  RESEARCH_QUEUE_ACTOR_ID,
  type ResearchMessageConsumer,
} from "@/lib/queue/research-consumer";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "sin1";

export { RESEARCH_QUEUE_ACTOR_ID };
export type { ResearchMessageConsumer };

/**
 * Validates an untrusted callback before any tenant repository is opened.
 * The consumer runs one research stage and publishes the next; a thrown
 * stage leaves the message for redelivery.
 */
export function createResearchQueueMessageHandler(consume: ResearchMessageConsumer) {
  return async (untrustedMessage: unknown): Promise<void> => {
    const message = parseResearchRunMessageV1(untrustedMessage);
    await consume(message);
  };
}

/**
 * Seconds before a retryable stage is delivered again. Without an explicit
 * directive the platform redelivers a thrown callback on its own backoff
 * (about five minutes was observed on Production on 2026-09-21), which eats
 * into the 15-minute stale window; the directive reschedules through the
 * queue's visibility API instead.
 */
export const RESEARCH_RETRY_AFTER_SECONDS = 60;

export function researchQueueRetry(error: unknown): { afterSeconds: number } | undefined {
  return error instanceof ResearchStageRetryError
    ? { afterSeconds: RESEARCH_RETRY_AFTER_SECONDS }
    : undefined;
}

export const POST = handleCallback(
  createResearchQueueMessageHandler((message) => consumeResearchRunMessage(message)),
  { visibilityTimeoutSeconds: maxDuration, retry: researchQueueRetry }
);
