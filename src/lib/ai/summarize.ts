/**
 * AI summarization module.
 *
 * Generates markdown summaries for content items using the AI router.
 * Uses content-length-aware routing: short content → single summarize call,
 * long content → map-reduce (chunk summaries + synthesis).
 * Output is structured JSON (SummaryOutput) rendered to markdown for storage.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import crypto from "crypto";
import * as aiRouter from "./router";
import {
  summarizePrompt,
  chunkSummarizePrompt,
  synthesizeChunkSummariesPrompt,
} from "@/lib/prompts/summarize";
import { getAISummary, upsertAISummary, getItemById } from "@/lib/database";
import type { SummaryOutput } from "./types";
import type { ContentItem } from "@/lib/types";
import type { AITask, ProviderName } from "./ai-config";
import {
  prepareCaptureSummaryInput,
  validateSummaryOutput,
} from "@/lib/intelligence/content-quality";
import { aiLogger } from "@/lib/logger";
import { getTraceId } from "@/lib/middleware/trace";

export type { SummaryOutput };

export interface RoutedGeneration<T> {
  value: T;
  provider: ProviderName;
  model: string;
}

/**
 * Temporary integration seam for the routing workstream. Once the router's
 * metadata API is present this calls it directly; the fallback keeps this
 * isolated branch buildable without duplicating model-fallback behavior.
 */
async function generateJSONWithObservedModel<T>(
  prompt: string,
  task: AITask
): Promise<RoutedGeneration<T>> {
  const metadataRouter = aiRouter as typeof aiRouter & {
    generateJSONWithMetadata?: <V>(prompt: string, task: AITask) => Promise<RoutedGeneration<V>>;
  };
  if (metadataRouter.generateJSONWithMetadata) {
    return metadataRouter.generateJSONWithMetadata<T>(prompt, task);
  }

  const value = await aiRouter.generateJSON<T>(prompt, task);
  const { provider, model } = aiRouter.getEffectiveModel(task);
  return { value, provider, model };
}

/** Estimate token count as ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split content into ~targetTokenCount chunks at paragraph boundaries. */
function splitIntoChunks(content: string, targetTokenCount: number): string[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    const candidate = current ? `${current}\n\n${p}` : p;
    if (estimateTokens(candidate) <= targetTokenCount) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Convert structured SummaryOutput to markdown for storage/display. */
export function renderSummaryMarkdown(output: SummaryOutput): string {
  const lines: string[] = [];

  lines.push("## TL;DR");
  lines.push("");
  lines.push(output.overview);
  lines.push("");
  lines.push("## Key Points");
  lines.push("");
  for (const point of output.keyPoints) {
    lines.push(`- ${point}`);
  }

  if (output.whyItMatters?.trim()) {
    lines.push("");
    lines.push("## Why This Matters");
    lines.push("");
    lines.push(output.whyItMatters);
  }

  if (output.notableQuotes && output.notableQuotes.length > 0) {
    lines.push("");
    lines.push("## Notable Quotes");
    lines.push("");
    for (const quote of output.notableQuotes) {
      lines.push(`- ${quote}`);
    }
  }

  return lines.join("\n");
}

/** Get the content to summarize (fullContent, summary, or fallback). */
function getSummarizableContent(item: { fullContent?: string; summary: string }): string {
  return item.fullContent ?? item.summary ?? "";
}

async function persistSummary(
  itemId: string,
  summary: string,
  model: string,
  promptType: "brief" | "detailed"
): Promise<void> {
  await upsertAISummary({
    id: crypto.randomUUID(),
    itemId,
    summary,
    model,
    promptType,
  });
}

export interface CaptureSummaryResult {
  output: SummaryOutput;
  summary: string;
  model: string;
  provider: ProviderName;
}

/** Generate and cache the single structured summary used by capture-time processing. */
export async function generateCaptureSummary(item: ContentItem): Promise<CaptureSummaryResult> {
  const source = prepareCaptureSummaryInput(getSummarizableContent(item));
  const prompt = summarizePrompt({ ...item, fullContent: source }, "brief");
  const generated = await generateJSONWithObservedModel<SummaryOutput>(prompt, "summarize");
  const output = validateSummaryOutput(generated.value, source, "brief");
  const summary = renderSummaryMarkdown(output);

  try {
    await persistSummary(item.id, summary, generated.model, "brief");
  } catch {
    aiLogger.warn(
      {
        event: "summary_cache_failed",
        traceId: getTraceId(),
        itemId: item.id,
        task: "summarize",
        provider: generated.provider,
        model: generated.model,
      },
      "summary_cache_failed"
    );
    throw new Error("Summary cache persistence failed");
  }
  return { output, summary, model: generated.model, provider: generated.provider };
}

/**
 * Generate an AI summary for a content item.
 *
 * Returns the cached summary if one exists (unless force=true).
 * Otherwise calls the AI router to generate a new one and stores it.
 *
 * - Short content (<2000 tokens): single "summarize" call
 * - Medium content (2000–8000 tokens): single "summarize-complex" call
 * - Long content (>8000 tokens): map-reduce (chunk with "summarize", synthesize with "summarize-complex")
 */
export async function generateSummary(
  itemId: string,
  options: { length?: "brief" | "detailed"; force?: boolean } = {}
): Promise<{ summary: string; cached: boolean }> {
  const length = options.length ?? "brief";

  if (!options.force) {
    const existing = await getAISummary(itemId, length);
    if (existing) {
      return { summary: existing.summary, cached: true };
    }
  }

  const item = await getItemById(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const content = getSummarizableContent(item);
  const estimatedTokens = estimateTokens(content);

  if (length === "brief") {
    const generated = await generateCaptureSummary(item);
    return { summary: generated.summary, cached: false };
  }

  let output: SummaryOutput;
  let generatedModel: string;

  if (estimatedTokens > 8000) {
    // Map-reduce: chunk → summarize each → synthesize
    const CHUNK_TARGET = 4000;
    const chunks = splitIntoChunks(content, CHUNK_TARGET);

    const chunkOutputs: SummaryOutput[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const prompt = chunkSummarizePrompt(chunks[i], i, chunks.length);
      const chunkGenerated = await generateJSONWithObservedModel<SummaryOutput>(
        prompt,
        "summarize"
      );
      chunkOutputs.push(validateSummaryOutput(chunkGenerated.value, chunks[i], "brief"));
    }

    const chunkSummaries = chunkOutputs.map((o) => JSON.stringify(o, null, 2));
    const synthesizePrompt = synthesizeChunkSummariesPrompt(chunkSummaries, item);
    const generated = await generateJSONWithObservedModel<SummaryOutput>(
      synthesizePrompt,
      "summarize-complex"
    );
    output = validateSummaryOutput(generated.value, content, "detailed");
    generatedModel = generated.model;
  } else if (estimatedTokens >= 2000) {
    // Medium: single summarize-complex call
    const prompt = summarizePrompt(item, length);
    const generated = await generateJSONWithObservedModel<SummaryOutput>(
      prompt,
      "summarize-complex"
    );
    output = validateSummaryOutput(generated.value, content, "detailed");
    generatedModel = generated.model;
  } else {
    // Short: single summarize call
    const prompt = summarizePrompt(item, length);
    const generated = await generateJSONWithObservedModel<SummaryOutput>(prompt, "summarize");
    output = validateSummaryOutput(generated.value, content, "detailed");
    generatedModel = generated.model;
  }

  const summary = renderSummaryMarkdown(output);
  await persistSummary(itemId, summary, generatedModel, length);

  return { summary, cached: false };
}
