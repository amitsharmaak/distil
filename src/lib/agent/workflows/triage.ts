/**
 * Triage workflow — prioritizes, summarizes, and embeds a newly added item.
 * SERVER-SIDE ONLY.
 */

import { getItemById } from "@/lib/db";
import { generateSummary } from "@/lib/ai/summarize";
import { embedItem } from "@/lib/ai/embeddings";
import { reprioritize } from "@/lib/ai/prioritize";
import { aiLogger } from "@/lib/logger";
import { detectStrategy } from "@/lib/content-strategies";

/**
 * Run the triage workflow for a single item.
 * 1. Generate brief AI summary
 * 2. Embed for semantic search
 * 3. Re-prioritize all items (updates this item's score)
 */
export async function runTriageWorkflow(itemId: string): Promise<void> {
  const item = getItemById(itemId);
  if (!item) {
    aiLogger.warn({ itemId }, "Triage skipped: item not found");
    return;
  }

  try {
    const strategy = detectStrategy(item.url);
    let embedText = item.summary;

    if (strategy.generateAISummary) {
      const { summary } = await generateSummary(itemId, { length: "brief" });
      embedText = summary || item.summary;
    }

    await embedItem(itemId, item.title, embedText);
    await reprioritize(false);
    aiLogger.info({ itemId }, "Triage completed");
  } catch (error) {
    aiLogger.error({ err: error, itemId }, "Triage failed");
    throw error;
  }
}
