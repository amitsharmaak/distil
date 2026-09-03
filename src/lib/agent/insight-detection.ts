/**
 * Cross-source insight detection — finds connections across different sources.
 *
 * When a new item is added, compares its embedding against recent items
 * from OTHER sources. If similarity exceeds threshold, creates a notification.
 *
 * SERVER-SIDE ONLY.
 */

import {
  getItemById,
  getRecentEmbeddings,
  insertNotification,
} from "@/lib/db";
import { generateEmbedding, cosineSimilarity } from "@/lib/ai/embeddings";
import { aiLogger } from "@/lib/logger";
import type { ContentItem } from "@/lib/types";

interface Insight {
  itemId: string;
  relatedItemId: string;
  similarity: number;
  crossSource: boolean;
}

/**
 * Detect insights (cross-source connections) for a newly added item.
 */
export async function detectInsights(itemId: string): Promise<Insight[]> {
  const item = getItemById(itemId);
  if (!item) return [];

  try {
    const text = `${item.title} ${item.summary}`;
    const embedding = await generateEmbedding(text);
    const recentEmbeddings = getRecentEmbeddings(14); // 2 weeks

    const insights: Insight[] = [];

    for (const row of recentEmbeddings) {
      if (row.item_id === itemId) continue;

      const otherEmbedding = JSON.parse(row.embedding) as number[];
      const sim = cosineSimilarity(embedding, otherEmbedding);

      if (sim > 0.75) {
        const otherItem = getItemById(row.item_id);
        if (!otherItem) continue;

        const crossSource = otherItem.sourceType !== item.sourceType;
        insights.push({
          itemId,
          relatedItemId: row.item_id,
          similarity: sim,
          crossSource,
        });
      }
    }

    // Sort by similarity, cross-source first
    insights.sort((a, b) => {
      if (a.crossSource !== b.crossSource) return a.crossSource ? -1 : 1;
      return b.similarity - a.similarity;
    });

    // Notify about top cross-source connections
    const crossSourceInsights = insights
      .filter((i) => i.crossSource)
      .slice(0, 3);
    for (const insight of crossSourceInsights) {
      const relatedItem = getItemById(insight.relatedItemId);
      if (!relatedItem) continue;

      insertNotification({
        id: crypto.randomUUID(),
        itemId: insight.itemId,
        title: "Cross-source connection",
        message: `"${item.title}" is related to "${relatedItem.title}" (${relatedItem.sourceType}). Similarity: ${(insight.similarity * 100).toFixed(0)}%.`,
      });

      aiLogger.info(
        {
          itemId: insight.itemId,
          relatedItemId: insight.relatedItemId,
          similarity: insight.similarity,
          sources: [item.sourceType, relatedItem.sourceType],
        },
        "Cross-source insight detected",
      );
    }

    return insights;
  } catch (error) {
    aiLogger.error({ err: error, itemId }, "Insight detection failed");
    return [];
  }
}
