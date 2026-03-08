/**
 * Auto-tagging module.
 *
 * Assigns topic tags to content items using AI classification.
 * SERVER-SIDE ONLY.
 */

import { generateJSON } from "./router";
import { updateItem, getItems, getItemById } from "@/lib/db";

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

  // Build taxonomy from existing topics in the last 100 items.
  const recentItems = getItems({ limit: 100, sort: "recent" });
  const taxonomy = new Set<string>();
  for (const item of recentItems) {
    for (const t of item.topics ?? []) {
      if (typeof t === "string" && t.trim()) taxonomy.add(t.trim());
    }
  }
  const taxonomyList = Array.from(taxonomy).sort();

  const prompt = `You are a content classifier. Assign 2-4 topic tags to the following content item.

Existing topics used in this system (prefer these when they fit; you may add new ones if needed):
${taxonomyList.length > 0 ? taxonomyList.map((t) => `- ${t}`).join("\n") : "(none yet — create appropriate tags)"}

Content to tag:
Title: ${title}
Summary: ${summary || "(no summary)"}

Respond with a JSON object: { "topics": ["tag1", "tag2", ...], "confidence": 0.0-1.0 }
- Use 2-4 short, lowercase topic tags (e.g. "ai", "productivity", "startups").
- Prefer existing taxonomy topics when they fit; add new ones only when necessary.
- confidence: how confident you are in the tags (0.0 to 1.0).`;

  const result = await generateJSON<TaggingResult>(prompt, "auto-tag");

  if (!result?.topics || !Array.isArray(result.topics)) {
    return undefined;
  }

  const topics = result.topics
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim())
    .slice(0, 4);

  if (topics.length === 0) return undefined;

  updateItem(itemId, { topics });
  return { topics, confidence: result.confidence ?? 0 };
}
