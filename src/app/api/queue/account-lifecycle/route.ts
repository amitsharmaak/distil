import { handleCallback } from "@vercel/queue";

import { parseTenantJobEnvelopeV1, type TenantJobEnvelopeV1 } from "@/lib/contracts/tenant-jobs";
import { consumeLifecycleTenantJobEnvelope } from "@/lib/lifecycle/queue-runtime";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "sin1";

export type LifecycleMessageConsumer = (
  message: TenantJobEnvelopeV1
) => Promise<"completed" | "failed" | "rejected" | "unsupported">;

/** Validates an untrusted callback before it can acquire any tenant capability. */
export function createLifecycleQueueMessageHandler(consume: LifecycleMessageConsumer) {
  return async (untrustedMessage: unknown): Promise<void> => {
    const message = parseTenantJobEnvelopeV1(untrustedMessage);
    const result = await consume(message);
    // A handler failure leaves the durable job pending. Let Vercel redeliver
    // the same envelope; rejected and unsupported envelopes are acknowledged.
    if (result === "failed") throw new Error("account_lifecycle_job_failed");
  };
}

async function consumeLifecycleMessage(message: TenantJobEnvelopeV1) {
  return consumeLifecycleTenantJobEnvelope(message);
}

export const POST = handleCallback(createLifecycleQueueMessageHandler(consumeLifecycleMessage), {
  visibilityTimeoutSeconds: maxDuration,
});
