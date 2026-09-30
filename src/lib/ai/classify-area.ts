/**
 * Life-area classification (inline search plan, phase F2).
 *
 * One small structured call per item decides whether it belongs to Amit's
 * personal life, his work, his learning or his updates. The answer is stored
 * in the AI columns only; Amit's own correction (`manual_area`) always wins
 * and is never overwritten here. Keeping the whole step behind this one
 * function and the `classify-area` task is what makes a later model swap a
 * config change.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { z } from "zod";

import { AIProviderError } from "./errors";
import { createTenantAIRouter } from "./router";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import { htmlToReadableText } from "@/lib/format";
import {
  AREA_EXCERPT_MAX_CHARS,
  AREA_MAX_EXAMPLES,
  classifyAreaPrompt,
  type AreaPromptExample,
} from "@/lib/prompts/classify-area";
import type { RepositorySet } from "@/lib/repositories/ports";
import { LIFE_AREAS, type ContentItem, type LifeArea } from "@/lib/types";

const REASON_MAX_CHARS = 200;

const areaOutputSchema = z.object({
  area: z.enum(LIFE_AREAS),
  confidence: z.coerce
    .number()
    .transform((value) => Math.min(1, Math.max(0, value)))
    .catch(0.5),
  reason: z
    .string()
    .transform((value) => value.trim().slice(0, REASON_MAX_CHARS))
    .catch(""),
});

const areaResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    area: { type: SchemaType.STRING, format: "enum", enum: [...LIFE_AREAS] },
    confidence: { type: SchemaType.NUMBER },
    reason: { type: SchemaType.STRING },
  },
  required: ["area", "confidence", "reason"],
};

export type AreaClassificationOutcome =
  | { status: "classified"; area: LifeArea; confidence: number }
  | {
      status: "skipped";
      reason: "missing" | "rejected" | "already-classified" | "manually-set";
    };

/**
 * What the classifier reads. `full` (capture) adds the opening text of the
 * item; `title-summary` (the backfill, decision 7) sends only the title, the
 * summary and the item's metadata, never body text.
 */
export type AreaInputMode = "full" | "title-summary";

export interface ClassifyItemAreaOptions {
  force?: boolean;
  now?: () => Date;
  input?: AreaInputMode;
  /** Preloaded correction examples, so a batch reads them once instead of per item. */
  examples?: AreaPromptExample[];
  /** Skip an item Amit has already sorted by hand (the backfill never spends a call on it). */
  skipManual?: boolean;
}

/** URL host without `www.`, the same form as the generated `items.site` column. */
export function siteOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

function excerptOf(item: Pick<ContentItem, "fullContent" | "summary">): string {
  const full = item.fullContent
    ? /<[a-z][^>]*>/i.test(item.fullContent)
      ? htmlToReadableText(item.fullContent)
      : item.fullContent.trim()
    : "";
  return (full || item.summary || "").slice(0, AREA_EXCERPT_MAX_CHARS);
}

/** The brief's overview when the brief is structured, otherwise its markdown. */
function briefText(record: { summary: string; structured?: unknown } | undefined): string {
  if (!record) return "";
  const structured = record.structured as { overview?: unknown } | undefined;
  return typeof structured?.overview === "string" ? structured.overview : record.summary;
}

/** Amit's most recent corrections, in the form the prompt shows them. */
export async function loadAreaExamples(repositories: RepositorySet): Promise<AreaPromptExample[]> {
  const corrections = await repositories.items.listAreaCorrections(AREA_MAX_EXAMPLES);
  return corrections.map((correction) => ({
    title: correction.title,
    site: siteOf(correction.url),
    author: correction.author,
    publication: correction.publication,
    sourceType: correction.sourceType,
    area: correction.correctedArea,
  }));
}

/**
 * Classifies one item into its life area and stores the answer. Idempotent:
 * an item that already has an AI area is skipped unless `force` is set, so a
 * redelivered capture message does not pay for a second call.
 */
export async function classifyItemArea(
  context: AuthContext,
  repositories: RepositorySet,
  itemId: string,
  options: ClassifyItemAreaOptions = {}
): Promise<AreaClassificationOutcome> {
  const state = await repositories.items.findAreaState(itemId);
  if (!state) return { status: "skipped", reason: "missing" };
  if (state.areaClassifiedAt && !options.force) {
    return { status: "skipped", reason: "already-classified" };
  }
  if (options.skipManual && state.manualArea) return { status: "skipped", reason: "manually-set" };
  const item = await repositories.items.findById(itemId);
  if (!item) return { status: "skipped", reason: "missing" };
  if (item.processingStatus === "rejected") return { status: "skipped", reason: "rejected" };

  const titleAndSummaryOnly = options.input === "title-summary";
  const [brief, examples] = await Promise.all([
    repositories.summaries.find(itemId, "brief"),
    options.examples ?? loadAreaExamples(repositories),
  ]);
  const prompt = classifyAreaPrompt({
    item: {
      title: item.title,
      sourceType: item.sourceType,
      contentType: item.contentType,
      site: siteOf(item.url),
      author: item.author,
      publication: item.publication,
      topics: item.topics,
    },
    // Title and summary only: the brief's overview, else the stored summary.
    brief: titleAndSummaryOnly ? briefText(brief) || item.summary : briefText(brief),
    excerpt: titleAndSummaryOnly ? undefined : excerptOf(item),
    examples,
  });

  const ai = createTenantAIRouter(context, repositories);
  const result = await ai.generateJSONWithMetadata<unknown>(prompt, "classify-area", {
    responseSchema: areaResponseSchema,
    timeoutMs: 15_000,
    maxAttempts: 1,
  });
  const parsed = areaOutputSchema.safeParse(result.value);
  if (!parsed.success) throw new AIProviderError("invalid_output", result.provider, result.model);

  await repositories.items.setAiArea(itemId, {
    area: parsed.data.area,
    confidence: parsed.data.confidence,
    reason: parsed.data.reason,
    model: result.model,
    classifiedAt: (options.now?.() ?? new Date()).toISOString(),
  });
  return { status: "classified", area: parsed.data.area, confidence: parsed.data.confidence };
}
