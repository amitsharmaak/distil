import { handleCallback } from "@vercel/queue";

import { createAuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";
import { createDefaultCaptureProcessor, CaptureWorker } from "@/lib/capture/worker";
import { parseCaptureQueueMessage, readLegacyCaptureQueueBridge } from "@/lib/capture/legacy-queue";
import { getTenantRepositories } from "@/lib/database";
import { indexCapturedItem } from "@/lib/knowledge/capture-index";
import { createCaptureQueueConsumer } from "@/lib/queue/consumer";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "sin1";

export const CAPTURE_QUEUE_ACTOR_ID = "00000000-0000-4000-8000-000000000002";

export type CaptureMessageConsumer = (message: CaptureQueueMessageV2) => Promise<void>;

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

async function consumeCaptureMessage(message: CaptureQueueMessageV2): Promise<void> {
  const context = createAuthContext({
    userId: message.userId,
    actorKind: "system",
    actorId: CAPTURE_QUEUE_ACTOR_ID,
    requestId: message.traceId,
  });
  const repositories = await getTenantRepositories(context);
  const worker = new CaptureWorker({
    context,
    captures: repositories.captures,
    processor: createDefaultCaptureProcessor({
      context,
      items: repositories.items,
      rawContent: repositories.rawContent,
      enqueueEnrichment: async (itemId) => {
        await indexCapturedItem({ context, repositories, itemId });
      },
    }),
    audit: async ({ action, traceId }) => {
      await repositories.agent.insertAuditLog({ id: crypto.randomUUID(), action, traceId });
    },
  });
  await createCaptureQueueConsumer(worker)(message);
}

export const POST = handleCallback(createCaptureQueueMessageHandler(consumeCaptureMessage), {
  visibilityTimeoutSeconds: maxDuration,
});
