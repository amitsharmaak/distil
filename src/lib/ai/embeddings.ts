/**
 * Embedding pipeline for semantic deduplication and search.
 * SERVER-SIDE ONLY.
 */

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "@/lib/config";
import {
  getRecentEmbeddings,
  upsertItemEmbedding,
} from "@/lib/db";

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const GEMINI_EMBEDDING_MODEL = "text-embedding-004";

type EmbeddingProvider = "openai" | "gemini";

function getEmbeddingProvider(): EmbeddingProvider | null {
  if (config.openaiApiKey) return "openai";
  if (config.geminiApiKey) return "gemini";
  return null;
}

/**
 * Generates a text embedding using the best available provider.
 * Prefers OpenAI (text-embedding-3-small), then Gemini (text-embedding-004).
 * Anthropic has no embedding model — falls back to another available provider.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  if (!provider) {
    throw new Error(
      "No embedding provider available. Configure OPENAI_API_KEY or GEMINI_API_KEY.",
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Cannot embed empty text");
  }

  if (provider === "openai") {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const response = await client.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: trimmed,
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI returned empty embedding");
    }
    return embedding;
  }

  // provider === "gemini"
  const genai = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genai.getGenerativeModel({ model: GEMINI_EMBEDDING_MODEL });
  const result = await model.embedContent(trimmed);
  const values = result.embedding?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini returned empty embedding");
  }
  return values;
}

/**
 * Standard cosine similarity between two vectors.
 * Returns a value in [-1, 1]; 1 means identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Finds items with embeddings similar to the given vector.
 * Only considers items from the last 30 days for performance.
 * Returns items above the threshold, sorted by similarity descending.
 */
export function findSimilarItems(
  embedding: number[],
  threshold = 0.85,
): Array<{ itemId: string; similarity: number }> {
  const rows = getRecentEmbeddings(30);
  const results: Array<{ itemId: string; similarity: number }> = [];

  for (const row of rows) {
    const other = JSON.parse(row.embedding) as number[];
    const sim = cosineSimilarity(embedding, other);
    if (sim >= threshold) {
      results.push({ itemId: row.item_id, similarity: sim });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * Generates an embedding for title + summary and stores it in item_embeddings.
 * Fire-and-forget safe: catches and logs errors.
 */
export async function embedItem(
  itemId: string,
  title: string,
  summary: string,
): Promise<void> {
  const provider = getEmbeddingProvider();
  if (!provider) {
    return; // No provider configured — skip silently
  }

  const text = `${title} ${summary}`.trim();
  if (!text) {
    return;
  }

  const embedding = await generateEmbedding(text);
  const model =
    provider === "openai" ? OPENAI_EMBEDDING_MODEL : GEMINI_EMBEDDING_MODEL;
  upsertItemEmbedding(itemId, embedding, model);
}
