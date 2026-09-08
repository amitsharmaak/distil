/**
 * Triage workflow — prioritizes, summarizes, and embeds a newly added item.
 * SERVER-SIDE ONLY.
 */

import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";
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
export async function runTriageWorkflow(
  context: AuthContext,
  repositories: RepositorySet,
  itemId: string
): Promise<void> {
  const item = await repositories.items.findById(itemId);
  if (!item) {
    aiLogger.warn({ itemId }, "Triage skipped: item not found");
    return;
  }

  try {
    const strategy = detectStrategy(item.url);
    let embedText = item.summary;

    if (strategy.generateAISummary) {
      const { summary } = await generateSummary(context, repositories, itemId, { length: "brief" });
      embedText = summary || item.summary;
    }

    await embedItem(repositories, itemId, item.title, embedText);
    await reprioritize(context, repositories, false);
    aiLogger.info({ itemId }, "Triage completed");
  } catch (error) {
    aiLogger.error({ err: error, itemId }, "Triage failed");
    throw error;
  }
}
