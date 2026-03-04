/**
 * AI summarization module.
 *
 * Generates markdown summaries for content items using Gemini.
 * Summaries are cached in the ai_summaries table.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import crypto from "crypto";
import { generateText, DEFAULT_MODEL } from "./client";
import { summarizePrompt } from "./prompts";
import { getAISummary, upsertAISummary, getItemById } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

/**
 * Generate an AI summary for a content item.
 *
 * Returns the cached summary if one exists (unless force=true).
 * Otherwise calls Gemini to generate a new one and stores it.
 */
export async function generateSummary(
  itemId: string,
  options: { length?: "brief" | "detailed"; force?: boolean } = {},
): Promise<{ summary: string; cached: boolean }> {
  const length = options.length ?? "brief";

  // Check cache first (unless forced regeneration).
  if (!options.force) {
    const existing = getAISummary(itemId);
    if (existing && existing.prompt_type === length) {
      return { summary: existing.summary, cached: true };
    }
  }

  // Fetch the item to summarize.
  const item = getItemById(itemId);
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const prompt = summarizePrompt(item, length);

  const summary = await generateText(prompt);

  // Store in cache.
  upsertAISummary({
    id: crypto.randomUUID(),
    itemId,
    summary,
    model: DEFAULT_MODEL,
    promptType: length,
  });

  return { summary, cached: false };
}
