import { handleCallback } from "@vercel/queue";

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

export const POST = handleCallback(
  createResearchQueueMessageHandler((message) => consumeResearchRunMessage(message)),
  { visibilityTimeoutSeconds: maxDuration }
);
