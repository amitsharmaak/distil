import { handleCallback } from "@vercel/queue";

import type { CaptureQueueMessage } from "@/lib/contracts/capture";
import { createDefaultCaptureProcessor, CaptureWorker } from "@/lib/capture/worker";
import { captureQueueMessageSchema } from "@/lib/capture/schema";
import { getRepositorySet } from "@/lib/database";
import { createCaptureQueueConsumer } from "@/lib/queue/consumer";

export const runtime = "nodejs";
export const maxDuration = 300;
export const preferredRegion = "sin1";

export type CaptureMessageConsumer = (message: CaptureQueueMessage) => Promise<void>;

/**
 * Keep queue-specific validation at the deployment boundary. The worker also
 * validates defensively, but rejecting an invalid callback here prevents any
 * repository or article-fetch work from starting.
 */
export function createCaptureQueueMessageHandler(consume: CaptureMessageConsumer) {
  return async (untrustedMessage: unknown): Promise<void> => {
    const message = captureQueueMessageSchema.parse(untrustedMessage);
    await consume(message);
  };
}

async function consumeCaptureMessage(message: CaptureQueueMessage): Promise<void> {
  const repositories = await getRepositorySet();
  const worker = new CaptureWorker({
    captures: repositories.captures,
    processor: createDefaultCaptureProcessor({ items: repositories.items }),
  });
  await createCaptureQueueConsumer(worker)(message);
}

export const POST = handleCallback(createCaptureQueueMessageHandler(consumeCaptureMessage), {
  visibilityTimeoutSeconds: maxDuration,
});
