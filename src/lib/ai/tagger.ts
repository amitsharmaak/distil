/**
 * Auto-tagging module.
 *
 * Assigns topic tags to content items using AI classification.
 * SERVER-SIDE ONLY.
 */

import { generateJSON } from "./router";
import { updateItem, getItemById } from "@/lib/db";
import { buildTaxonomyPromptSection, normalizeTags } from "./taxonomy";

interface TaggingResult {
  topics: string[];
  confidence: number;
}

/**
 * Auto-tags an item with 2-4 topic tags using AI classification.
 * Only tags items that currently have no topics (empty array).
 * Fetches existing topics from recent items to build a taxonomy for consistency.
 *
 * @param itemId - The item ID to tag
 * @param title - Item title
 * @param summary - Item summary (may be empty)
 * @returns The tagging result, or undefined if item already had topics
 */
export async function autoTagItem(
  itemId: string,
  title: string,
  summary: string
): Promise<TaggingResult | undefined> {
  const item = getItemById(itemId);
  if (!item || (item.topics?.length ?? 0) > 0) {
    return undefined;
  }

  const prompt = `You are a content classifier. Assign 2-3 topic tags to the following content item.

You MUST pick from the canonical taxonomy below:
${buildTaxonomyPromptSection()}

Content to tag:
Title: ${title}
Summary: ${summary || "(no summary)"}

Respond with a JSON object: { "topics": ["tag1", "tag2"], "confidence": 0.0-1.0 }
Rules:
- Pick exactly 2-3 tags from the taxonomy above.
- Only add 1 new tag if nothing fits — it must be a broad domain word, never a product name, company name, or version number.
- confidence: how confident you are in the tags (0.0 to 1.0).`;

  const result = await generateJSON<TaggingResult>(prompt, "auto-tag");

  if (!result?.topics || !Array.isArray(result.topics)) {
    return undefined;
  }

  const topics = normalizeTags(
    result.topics
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim()),
  ).slice(0, 3);

  if (topics.length === 0) return undefined;

  updateItem(itemId, { topics });
  return { topics, confidence: result.confidence ?? 0 };
}
