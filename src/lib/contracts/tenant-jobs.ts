import { z } from "zod";

import { authContextSchema, type AuthContext } from "@/lib/contracts/tenant-context";

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
    captureId: captureIdSchema,
    authContext: authContextSchema,
  })
  .strict()
  .readonly();

export type CaptureQueueMessageV2 = z.infer<typeof captureQueueMessageV2Schema>;

export interface CreateCaptureQueueMessageV2Input {
  readonly captureId: string;
  readonly authContext: AuthContext;
}

export function parseCaptureQueueMessageV2(value: unknown): CaptureQueueMessageV2 {
  return captureQueueMessageV2Schema.parse(value);
}

export function createCaptureQueueMessageV2(
  input: CreateCaptureQueueMessageV2Input
): CaptureQueueMessageV2 {
  return parseCaptureQueueMessageV2({ version: 2, ...input });
}

export interface TenantJobEnvelopeV1<TPayload> {
  readonly version: 1;
  readonly jobId: JobId;
  readonly jobType: JobType;
  readonly authContext: AuthContext;
  readonly payload: TPayload;
}

export interface CreateTenantJobEnvelopeV1Input<TPayload> {
  readonly jobId: string;
  readonly jobType: string;
  readonly authContext: AuthContext;
  readonly payload: TPayload;
}

/**
 * Bind an envelope to its job-specific payload schema. Callers should make the
 * payload schema strict and readonly when the payload is an object.
 */
export function tenantJobEnvelopeV1Schema<TPayload>(payloadSchema: z.ZodType<TPayload>) {
  return z
    .object({
      version: z.literal(1),
      jobId: jobIdSchema,
      jobType: jobTypeSchema,
      authContext: authContextSchema,
      payload: payloadSchema,
    })
    .strict()
    .readonly();
}

export function parseTenantJobEnvelopeV1<TPayload>(
  value: unknown,
  payloadSchema: z.ZodType<TPayload>
): TenantJobEnvelopeV1<TPayload> {
  return tenantJobEnvelopeV1Schema(payloadSchema).parse(value);
}

export function createTenantJobEnvelopeV1<TPayload>(
  input: CreateTenantJobEnvelopeV1Input<TPayload>,
  payloadSchema: z.ZodType<TPayload>
): TenantJobEnvelopeV1<TPayload> {
  return parseTenantJobEnvelopeV1({ version: 1, ...input }, payloadSchema);
}
