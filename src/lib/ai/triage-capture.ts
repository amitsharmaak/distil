/**
 * Capture triage (backlog item "capture priority score and junk-page check").
 *
 * One small structured call per generic article capture, before any item or
 * summary exists, returns a junk-page verdict (content or one of the junk
 * kinds) and a 0–100 priority score. Output is parsed tolerantly: confidence
 * and score are clamped with safe defaults, and `readable` is derived from the
 * kind so the verdict is always coherent. Only a missing or unknown kind is
 * unusable and throws AIProviderError("invalid_output"). Whether a verdict may
 * reject a capture is decided by `shouldRejectAsJunk` in the contract, not here.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { z } from "zod";

import { siteOf } from "./classify-area";
import { AIProviderError } from "./errors";
import { getPreferences } from "./preferences";
import { createTenantAIRouter } from "./router";
import {
  TRIAGE_EXCERPT_MAX_CHARS,
  TRIAGE_JUNK_KINDS,
  TRIAGE_PROMPT_VERSION,
  type CaptureTriage,
  type CaptureTriageInput,
  type CaptureTriageVerdict,
} from "@/lib/contracts/capture-triage";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import { captureTriagePrompt } from "@/lib/prompts/capture-triage";
import type { RepositorySet } from "@/lib/repositories/ports";

export type TriageGenerate = (
  prompt: string,
  responseSchema: ResponseSchema
) => Promise<{ value: unknown; model: string }>;

const REASON_MAX_CHARS = 200;
const TRIAGE_TIMEOUT_MS = 8_000;
const TRIAGE_KINDS = ["content", ...TRIAGE_JUNK_KINDS] as const;

/** A finite number or a numeric string; null, booleans and blanks fall through to the default. */
const numeric = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? Number(value) : value),
  z.number()
);

const triageOutputSchema = z.object({
  kind: z.enum(TRIAGE_KINDS),
  confidence: numeric.transform((value) => Math.min(1, Math.max(0, value))).catch(0.5),
  priority_score: numeric
    .transform((value) => Math.min(100, Math.max(0, Math.round(value))))
    .catch(50),
  reason: z
    .string()
    .transform((value) => value.trim().slice(0, REASON_MAX_CHARS))
    .catch(""),
});

export const triageResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    kind: { type: SchemaType.STRING, format: "enum", enum: [...TRIAGE_KINDS] },
    readable: { type: SchemaType.BOOLEAN },
    confidence: { type: SchemaType.NUMBER },
    priority_score: { type: SchemaType.NUMBER },
    reason: { type: SchemaType.STRING },
  },
  required: ["kind", "readable", "confidence", "priority_score", "reason"],
};

/** One structured call; throws AIProviderError("invalid_output") on unusable output. */
export async function triageCapture(
  input: CaptureTriageInput,
  generate: TriageGenerate
): Promise<CaptureTriageVerdict> {
  const result = await generate(captureTriagePrompt(input), triageResponseSchema);
  const parsed = triageOutputSchema.safeParse(result.value);
  if (!parsed.success) throw new AIProviderError("invalid_output", undefined, result.model);
  const { kind, confidence, priority_score: priorityScore, reason } = parsed.data;
  return {
    kind,
    // Coherence: the kind decides readability, whatever the model said.
    readable: kind === "content",
    confidence,
    priorityScore,
    reason,
    model: result.model,
    promptVersion: TRIAGE_PROMPT_VERSION,
  };
}

async function preferenceSummaryOf(repositories: RepositorySet): Promise<string | undefined> {
  try {
    const summary = (await getPreferences(repositories)).recentFeedbackSummary;
    return typeof summary === "string" && summary.trim() ? summary : undefined;
  } catch {
    // Preferences are a hint only; triage continues without them.
    return undefined;
  }
}

/** Tenant-routed triage on task "triage-capture" (timeoutMs 8000, maxAttempts 1). */
export function createTenantCaptureTriage(
  context: AuthContext,
  repositories: RepositorySet
): CaptureTriage {
  return async (input) => {
    const preferenceSummary = input.preferenceSummary ?? (await preferenceSummaryOf(repositories));
    const ai = createTenantAIRouter(context, repositories);
    return triageCapture({ ...input, preferenceSummary }, async (prompt, responseSchema) => {
      const result = await ai.generateJSONWithMetadata<unknown>(prompt, "triage-capture", {
        responseSchema,
        timeoutMs: TRIAGE_TIMEOUT_MS,
        maxAttempts: 1,
      });
      return { value: result.value, model: result.model };
    });
  };
}

export function triageInputFromText(args: {
  url: string;
  title?: string;
  author?: string;
  publication?: string;
  text: string;
  preferenceSummary?: string;
}): CaptureTriageInput {
  const text = args.text.trim();
  return {
    url: args.url,
    site: siteOf(args.url),
    title: args.title,
    author: args.author,
    publication: args.publication,
    excerpt: text.slice(0, TRIAGE_EXCERPT_MAX_CHARS),
    readableChars: text.length,
    preferenceSummary: args.preferenceSummary,
  };
}
