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
import { generateJSON, getEffectiveModel } from "./router";
import {
  summarizePrompt,
  chunkSummarizePrompt,
  synthesizeChunkSummariesPrompt,
} from "./prompts";
import { getAISummary, upsertAISummary, getItemById } from "@/lib/db";
import type { SummaryOutput } from "./types";

export type { SummaryOutput };

/** Estimate token count as ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split content into ~targetTokenCount chunks at paragraph boundaries. */
function splitIntoChunks(
  content: string,
  targetTokenCount: number,
): string[] {
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
  options: { length?: "brief" | "detailed"; force?: boolean } = {},
): Promise<{ summary: string; cached: boolean }> {
  const length = options.length ?? "brief";

  if (!options.force) {
    const existing = getAISummary(itemId, length);
    if (existing) {
      return { summary: existing.summary, cached: true };
    }
  }

  const item = getItemById(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const content = getSummarizableContent(item);
  const estimatedTokens = estimateTokens(content);

  let output: SummaryOutput;

  if (estimatedTokens > 8000) {
    // Map-reduce: chunk → summarize each → synthesize
    const CHUNK_TARGET = 4000;
    const chunks = splitIntoChunks(content, CHUNK_TARGET);

    const chunkOutputs: SummaryOutput[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const prompt = chunkSummarizePrompt(chunks[i], i, chunks.length);
      const chunkOutput = await generateJSON<SummaryOutput>(prompt, "summarize");
      chunkOutputs.push(chunkOutput);
    }

    const chunkSummaries = chunkOutputs.map((o) => JSON.stringify(o, null, 2));
    const synthesizePrompt = synthesizeChunkSummariesPrompt(chunkSummaries, item);
    output = await generateJSON<SummaryOutput>(synthesizePrompt, "summarize-complex");
  } else if (estimatedTokens >= 2000) {
    // Medium: single summarize-complex call
    const prompt = summarizePrompt(item, length);
    output = await generateJSON<SummaryOutput>(prompt, "summarize-complex");
  } else {
    // Short: single summarize call
    const prompt = summarizePrompt(item, length);
    output = await generateJSON<SummaryOutput>(prompt, "summarize");
  }

  const summary = renderSummaryMarkdown(output);
  const task = estimatedTokens > 8000 ? "summarize-complex" : estimatedTokens >= 2000 ? "summarize-complex" : "summarize";
  const { model } = getEffectiveModel(task);

  upsertAISummary({
    id: crypto.randomUUID(),
    itemId,
    summary,
    model,
    promptType: length,
  });

  return { summary, cached: false };
}
