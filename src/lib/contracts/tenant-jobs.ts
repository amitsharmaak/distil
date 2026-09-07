import { z } from "zod";

import { traceIdSchema, userIdSchema } from "@/lib/contracts/tenant-context";

export const captureIdSchema = z.string().uuid().brand<"CaptureId">();
export const jobIdSchema = z.string().uuid().brand<"JobId">();
export const jobTypeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u, "Invalid job type")
  .brand<"JobType">();

export type CaptureId = z.infer<typeof captureIdSchema>;
export type JobId = z.infer<typeof jobIdSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;

/** Additive successor to CaptureQueueMessage. Existing queue consumers remain on v1. */
export const captureQueueMessageV2Schema = z
  .object({
    version: z.literal(2),
    userId: userIdSchema,
    captureId: captureIdSchema,
    traceId: traceIdSchema,
  })
  .strict()
  .readonly();

export type CaptureQueueMessageV2 = z.infer<typeof captureQueueMessageV2Schema>;

export interface CreateCaptureQueueMessageV2Input {
  readonly userId: string;
  readonly captureId: string;
  readonly traceId: string;
}

export function parseCaptureQueueMessageV2(value: unknown): CaptureQueueMessageV2 {
  return captureQueueMessageV2Schema.parse(value);
}

export function createCaptureQueueMessageV2(
  input: CreateCaptureQueueMessageV2Input
): CaptureQueueMessageV2 {
  return parseCaptureQueueMessageV2({ ...input, version: 2 });
}

export const tenantJobEnvelopeV1Schema = z
  .object({
    version: z.literal(1),
    userId: userIdSchema,
    jobId: jobIdSchema,
    jobType: jobTypeSchema,
    traceId: traceIdSchema,
  })
  .strict()
  .readonly();

export type TenantJobEnvelopeV1 = z.infer<typeof tenantJobEnvelopeV1Schema>;

export interface CreateTenantJobEnvelopeV1Input {
  readonly userId: string;
  readonly jobId: string;
  readonly jobType: string;
  readonly traceId: string;
}

export function parseTenantJobEnvelopeV1(value: unknown): TenantJobEnvelopeV1 {
  return tenantJobEnvelopeV1Schema.parse(value);
}

export function createTenantJobEnvelopeV1(
  input: CreateTenantJobEnvelopeV1Input
): TenantJobEnvelopeV1 {
  return parseTenantJobEnvelopeV1({ ...input, version: 1 });
}
