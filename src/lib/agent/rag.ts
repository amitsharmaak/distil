/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 *
 * Query → Intent classification → Retrieval → Chunk → Generate with citations.
 *
 * SERVER-SIDE ONLY.
 */

import { hybridSearch } from "@/lib/ai/search";
import { generateText } from "@/lib/ai/router";
import { filterPII } from "@/lib/pii-filter";
import { aiLogger } from "@/lib/logger";
import { getItems } from "@/lib/db";
import type { ContentItem } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// "specific"      — targeted question; uses hybrid search to find relevant items
// "general"       — digest/browse query; retrieves most recent unread items
// "conversational"— greeting or social; answered directly with no retrieval
type QueryIntent = "specific" | "general" | "conversational";

// ─────────────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────────────

const SPECIFIC_PROMPT = `You are Distil, a personal information assistant. Answer the user's question using ONLY the context provided below. If the context doesn't contain enough information, say so honestly.

Rules:
- Cite sources using [N] notation where N is the source number
- Never fabricate information not in the context
- Be concise and direct
- If multiple sources discuss the same topic, synthesize them

Context:
{CONTEXT}

Question: {QUESTION}

Provide a clear, cited answer:`;

const GENERAL_PROMPT = `You are Distil, a personal information assistant. The user asked a general question about their saved content. Below is a curated selection of their most recent unread or high-priority items. Use them to give a helpful overview.

Rules:
- Cite sources using [N] notation where N is the source number
- Never fabricate information not in the context
- Be concise and direct — the user wants a quick digest, not a wall of text
- Group or theme related items if possible
- If the user asked for recommendations, prioritize items that seem most important or actionable

Items:
{CONTEXT}

Question: {QUESTION}

Provide a helpful, cited response:`;

const CONVERSATIONAL_PROMPT = `You are Distil, a friendly personal information assistant. Respond naturally to the user's message. Keep it brief. If the user seems to be transitioning to a question about their content, invite them to ask.

User: {QUESTION}

Response:`;

// ─────────────────────────────────────────────────────────────────────────────
// Intent classification
// ─────────────────────────────────────────────────────────────────────────────

const CONVERSATIONAL_RE =
  /^(hi|hello|hey|thanks|thank you|ok|okay|bye|good morning|good night|good evening|yo|sup|cheers)\b/;

const GENERAL_RE =
  /\b(what should i|summarize|summarise|summary|overview|what's new|whats new|unread|recommend|catch me up|brief me|brief|digest|highlights?|anything interesting|what do i have|what's in my feed|show me|latest|recent items?|what articles|what items|what content|list my|list all|my library|any articles|any items|any content|do you have)\b/;

// Regex-based intent classification is intentionally simple: it's fast, free,
// and the patterns are narrow enough that false positives are rare. The worst
// outcome of a misclassification is a slightly less targeted answer.
function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase().trim();

  if (CONVERSATIONAL_RE.test(q)) return "conversational";
  if (GENERAL_RE.test(q)) return "general";

  return "specific";
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunking
// ─────────────────────────────────────────────────────────────────────────────

// Splits content at paragraph boundaries to avoid cutting sentences mid-thought.
// targetSize is in estimated tokens (chars / 4). 500 tokens ≈ 375 words.
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

// ─────────────────────────────────────────────────────────────────────────────
// Retrieval strategies
// ─────────────────────────────────────────────────────────────────────────────

function itemsToChunks(
  items: ContentItem[],
  maxChunks: number,
): RAGChunk[] {
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
        relevanceScore: (1.0 / (i + 1)) * (1.0 / (j + 1)),
      });
    }
  }

  chunks.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return chunks.slice(0, maxChunks);
}

async function retrieveForSpecific(
  query: string,
  maxChunks: number,
): Promise<RAGChunk[]> {
  const items = await hybridSearch(query, { limit: 20 });
  return itemsToChunks(items, maxChunks);
}

function retrieveForGeneral(maxChunks: number): RAGChunk[] {
  // Prefer unread items; fall back to all recent if nothing is unread
  let items = getItems({ isRead: false, limit: 15 });
  if (items.length === 0) {
    items = getItems({ limit: 15 });
  }
  return itemsToChunks(items, maxChunks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main RAG entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function ragQuery(query: string): Promise<RAGResult> {
  const { filtered: filteredQuery } = filterPII(query);
  const intent = classifyIntent(filteredQuery);

  aiLogger.debug({ intent, query: filteredQuery.slice(0, 80) }, "RAG intent");

  // ── Conversational: respond directly, no retrieval ──
  if (intent === "conversational") {
    const prompt = CONVERSATIONAL_PROMPT.replace("{QUESTION}", filteredQuery);
    try {
      const answer = await generateText(prompt, "research-synthesize");
      return { answer, citations: [], chunksUsed: 0, totalTokensEstimate: Math.ceil(prompt.length / 4) };
    } catch {
      return {
        answer: "Hey! I'm Distil, your information assistant. Ask me anything about your saved content.",
        citations: [],
        chunksUsed: 0,
        totalTokensEstimate: 0,
      };
    }
  }

  // ── Specific or General: retrieve context ──
  const maxChunks = 10;
  let chunks: RAGChunk[];

  if (intent === "specific") {
    chunks = await retrieveForSpecific(filteredQuery, maxChunks);
    // Fall back to general retrieval when specific search finds nothing but items exist
    if (chunks.length === 0) {
      chunks = retrieveForGeneral(maxChunks);
    }
  } else {
    chunks = retrieveForGeneral(maxChunks);
  }

  if (chunks.length === 0) {
    return {
      answer:
        "Your library is empty right now. Save some articles, newsletters, or links first — then I can answer questions about them, recommend what to read, and more.",
      citations: [],
      chunksUsed: 0,
      totalTokensEstimate: 0,
    };
  }

  // ── Build context with numbered sources ──
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
  const promptTemplate =
    intent === "general" ? GENERAL_PROMPT : SPECIFIC_PROMPT;
  const prompt = promptTemplate
    .replace("{CONTEXT}", context)
    .replace("{QUESTION}", filteredQuery);

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
