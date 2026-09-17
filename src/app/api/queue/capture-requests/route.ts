import { handleCallback } from "@vercel/queue";

import { parseCaptureQueueMessage, readLegacyCaptureQueueBridge } from "@/lib/capture/legacy-queue";
import {
  CAPTURE_QUEUE_ACTOR_ID,
  consumeCaptureMessage,
  type CaptureMessageConsumer,
} from "@/lib/queue/capture-consumer";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "sin1";

export { CAPTURE_QUEUE_ACTOR_ID };
export type { CaptureMessageConsumer };

/**
 * Keep queue-specific validation at the deployment boundary. The worker also
 * validates defensively, but rejecting an invalid callback here prevents any
 * repository or article-fetch work from starting.
 */
export function createCaptureQueueMessageHandler(consume: CaptureMessageConsumer) {
  return async (untrustedMessage: unknown): Promise<void> => {
    const message = parseCaptureQueueMessage(untrustedMessage, readLegacyCaptureQueueBridge());
    await consume(message);
  };
}

export const POST = handleCallback(createCaptureQueueMessageHandler(consumeCaptureMessage), {
  visibilityTimeoutSeconds: maxDuration,
});
