/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 *
 * Query → Hybrid search → Chunk → Rerank → Generate with citations.
 *
 * SERVER-SIDE ONLY.
 */

import { hybridSearch } from "@/lib/ai/search";
import { generateText } from "@/lib/ai/router";
import { filterPII } from "@/lib/pii-filter";
import { aiLogger } from "@/lib/logger";
import type { ContentItem } from "@/lib/types";

interface RAGChunk {
  itemId: string;
  title: string;
  text: string;
  sourceType: string;
  url: string;
  relevanceScore: number;
}

export interface RAGResult {
  answer: string;
  citations: Array<{
    id: string;
    title: string;
    url: string;
    sourceType: string;
  }>;
  chunksUsed: number;
  totalTokensEstimate: number;
}

const RAG_PROMPT = `You are Distil, a personal information assistant. Answer the user's question using ONLY the context provided below. If the context doesn't contain enough information, say so honestly.

Rules:
- Cite sources using [N] notation where N is the source number
- Never fabricate information not in the context
- Be concise and direct
- If multiple sources discuss the same topic, synthesize them

Context:
{CONTEXT}

Question: {QUESTION}

Provide a clear, cited answer:`;

/**
 * Splits content into chunks of approximately targetSize tokens.
 */
function chunkContent(text: string, targetSize = 500): string[] {
  if (!text) return [];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const estimatedTokens = Math.ceil((current + paragraph).length / 4);
    if (estimatedTokens > targetSize && current.length > 0) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current += (current ? "\n\n" : "") + paragraph;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Retrieves and ranks chunks relevant to the query.
 */
async function retrieveChunks(
  query: string,
  maxChunks = 10,
): Promise<RAGChunk[]> {
  // Hybrid search to find relevant items
  const items = await hybridSearch(query, { limit: 20 });

  if (items.length === 0) return [];

  const chunks: RAGChunk[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const content = item.fullContent ?? item.summary;
    const contentChunks = chunkContent(content);

    for (let j = 0; j < contentChunks.length; j++) {
      chunks.push({
        itemId: item.id,
        title: item.title,
        text: contentChunks[j],
        sourceType: item.sourceType,
        url: item.url,
        // Simple relevance: earlier items from search are more relevant,
        // first chunks within an item are more relevant
        relevanceScore: (1.0 / (i + 1)) * (1.0 / (j + 1)),
      });
    }
  }

  // Sort by relevance and take top K
  chunks.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return chunks.slice(0, maxChunks);
}

/**
 * Run the RAG pipeline: retrieve relevant content and generate a cited answer.
 */
export async function ragQuery(query: string): Promise<RAGResult> {
  const { filtered: filteredQuery } = filterPII(query);

  // Retrieve relevant chunks
  const chunks = await retrieveChunks(filteredQuery);

  if (chunks.length === 0) {
    return {
      answer:
        "I don't have any saved content that's relevant to your question. Try saving some articles or content first, and I'll be able to answer questions about them.",
      citations: [],
      chunksUsed: 0,
      totalTokensEstimate: 0,
    };
  }

  // Build context with numbered sources
  const seenItems = new Map<string, number>();
  const citations: RAGResult["citations"] = [];
  const contextParts: string[] = [];

  for (const chunk of chunks) {
    let sourceNum = seenItems.get(chunk.itemId);
    if (sourceNum === undefined) {
      sourceNum = citations.length + 1;
      seenItems.set(chunk.itemId, sourceNum);
      citations.push({
        id: chunk.itemId,
        title: chunk.title,
        url: chunk.url,
        sourceType: chunk.sourceType,
      });
    }

    const { filtered } = filterPII(chunk.text);
    contextParts.push(
      `[Source ${sourceNum}: "${chunk.title}" (${chunk.sourceType})]:\n${filtered}`,
    );
  }

  const context = contextParts.join("\n\n---\n\n");
  const prompt = RAG_PROMPT.replace("{CONTEXT}", context).replace(
    "{QUESTION}",
    filteredQuery,
  );

  const totalTokensEstimate = Math.ceil(prompt.length / 4);

  try {
    const answer = await generateText(prompt, "research-synthesize");

    return {
      answer,
      citations,
      chunksUsed: chunks.length,
      totalTokensEstimate,
    };
  } catch (error) {
    aiLogger.error({ err: error }, "RAG query generation failed");
    return {
      answer:
        "I encountered an error while processing your question. Please try again.",
      citations,
      chunksUsed: chunks.length,
      totalTokensEstimate,
    };
  }
}
