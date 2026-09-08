import { z } from "zod";

import {
  captureQueueMessageV2Schema,
  createCaptureQueueMessageV2,
  type CaptureQueueMessageV2,
} from "@/lib/contracts/tenant-jobs";
import { traceIdSchema, userIdSchema } from "@/lib/contracts/tenant-context";

const legacyCaptureQueueMessageV1Schema = z
  .object({ version: z.literal(1), captureId: z.string().uuid() })
  .strict();

export interface LegacyCaptureQueueBridge {
  readonly enabled: boolean;
  readonly amitUserId?: string;
}

/**
 * Removable, bounded bridge for queue messages created before the Phase 3 cutover.
 * It can target only the explicitly migrated Amit account and is disabled by default.
 */
export function parseCaptureQueueMessage(
  value: unknown,
  bridge: LegacyCaptureQueueBridge = { enabled: false },
  traceId: () => string = () => crypto.randomUUID()
): CaptureQueueMessageV2 {
  const v2 = captureQueueMessageV2Schema.safeParse(value);
  if (v2.success) return v2.data;
  if (!bridge.enabled) throw v2.error;

  const v1 = legacyCaptureQueueMessageV1Schema.parse(value);
  const userId = userIdSchema.parse(bridge.amitUserId);
  return createCaptureQueueMessageV2({
    userId,
    captureId: v1.captureId,
    traceId: traceIdSchema.parse(traceId()),
  });
}

export function readLegacyCaptureQueueBridge(
  env: NodeJS.ProcessEnv = process.env
): LegacyCaptureQueueBridge {
  return Object.freeze({
    enabled: env.DISTIL_LEGACY_CAPTURE_QUEUE_V1 === "true",
    ...(env.DISTIL_LEGACY_USER_ID ? { amitUserId: env.DISTIL_LEGACY_USER_ID } : {}),
  });
}
