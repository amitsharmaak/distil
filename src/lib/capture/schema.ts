import { z } from "zod";

import { CAPTURE_SOURCES, type CreateCaptureRequest } from "@/lib/contracts/capture";

export const createCaptureSchema = z
  .object({
    url: z.string().trim().min(1).max(8_192),
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().max(10_000).optional(),
    topics: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
    source: z.enum(CAPTURE_SOURCES),
  })
  .strict() satisfies z.ZodType<CreateCaptureRequest>;

export const captureQueueMessageSchema = z
  .object({ version: z.literal(1), captureId: z.string().uuid() })
  .strict();
