/**
 * Hybrid semantic + keyword search.
 * Combines FTS5 keyword results with embedding cosine similarity.
 * SERVER-SIDE ONLY.
 */

import { getItems, getItemById, getRecentEmbeddings } from "@/lib/db";
import { generateEmbedding, cosineSimilarity } from "./embeddings";
import type { ItemFilters } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

/**
 * Performs hybrid search: runs FTS keyword search and semantic search in parallel,
 * then merges and re-ranks results.
 */
export async function hybridSearch(
  query: string,
  filters: Omit<ItemFilters, "query"> = {},
): Promise<ContentItem[]> {
  // Run FTS and semantic search in parallel
  const [ftsResults, semanticResults] = await Promise.all([
    // FTS keyword search (synchronous but wrapped in Promise for parallel execution)
    Promise.resolve(getItems({ ...filters, query })),
    // Semantic search
    semanticSearch(query, filters),
  ]);

  // Merge results: FTS results first (already ranked), then add semantic-only results
  const seen = new Set(ftsResults.map((item) => item.id));
  const merged = [...ftsResults];

  for (const item of semanticResults) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }

  if (filters.limit !== undefined) {
    return merged.slice(0, filters.limit);
  }
  return merged;
}

async function semanticSearch(
  query: string,
  filters: Omit<ItemFilters, "query">,
): Promise<ContentItem[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    const recentEmbeddings = getRecentEmbeddings(90); // 90 days for search

    // Compute similarities
    const similarities: Array<{ itemId: string; similarity: number }> = [];
    for (const row of recentEmbeddings) {
      const embedding = JSON.parse(row.embedding) as number[];
      const sim = cosineSimilarity(queryEmbedding, embedding);
      if (sim > 0.3) {
        // Lower threshold for search than dedup
        similarities.push({ itemId: row.item_id, similarity: sim });
      }
    }

    // Sort by similarity, get top 20
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topIds = similarities.slice(0, 20).map((s) => s.itemId);

    if (topIds.length === 0) return [];

    // Fetch the actual items and apply filters
    const items = topIds
      .map((id) => getItemById(id))
      .filter((item): item is ContentItem => item != null)
      .filter((item) => {
        if (filters.sourceType && item.sourceType !== filters.sourceType)
          return false;
        if (filters.contentType && item.contentType !== filters.contentType)
          return false;
        if (filters.priority && item.priority !== filters.priority)
          return false;
        if (filters.isRead !== undefined && item.isRead !== filters.isRead)
          return false;
        return true;
      });

    return items;
  } catch (error) {
    console.error("Semantic search failed, falling back to FTS:", error);
    return [];
  }
}
