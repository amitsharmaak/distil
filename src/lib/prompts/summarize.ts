/**
 * Prompt templates for content summarization.
 *
 * Used by the AI summarization pipeline (src/lib/ai/summarize.ts).
 */

import type { ContentItem } from "@/lib/types";
import type { SummaryOutput } from "@/lib/ai/types";

export type { SummaryOutput };

const SUMMARY_OUTPUT_SCHEMA = `{
  "overview": "2-3 sentence overview paragraph",
  "keyPoints": ["point 1", "point 2", "..."],
  "whyItMatters": "optional short paragraph on significance (detailed mode only)",
  "notableQuotes": ["optional quote 1", "optional quote 2"]
}`;

export function summarizePrompt(
  item: ContentItem,
  length: "brief" | "detailed",
): string {
  const contentSection = item.fullContent
    ? `## Full Content\n${item.fullContent}`
    : item.summary
      ? `## Available Summary\n${item.summary}\n\n(Full content not available — summarize based on available metadata.)`
      : "(Only title and metadata available — provide what insights you can from the title and source.)";

  const formatInstructions =
    length === "brief"
      ? `- overview: 2-3 sentence overview paragraph
- keyPoints (Key Points): array of 3-5 bullet points
- whyItMatters: omit or leave empty
- notableQuotes: omit or leave empty`
      : `- overview: 2-3 sentence overview paragraph
- keyPoints (Key Points): array of 5-8 bullet points
- whyItMatters (Why This Matters): short paragraph on significance and implications
- notableQuotes (Notable Quotes): 1-3 key quotes if available in the content`;

  return `You are a content summarizer for a personal information aggregator. Your job is to create clear, insightful summaries that help the reader quickly understand the key information.

## Content to Summarize
- **Title:** ${item.title}
- **Author:** ${item.author ?? "Unknown"}
- **Publication:** ${item.publication ?? "Unknown"}
- **Type:** ${item.contentType}
- **Topics:** ${item.topics.join(", ") || "None specified"}
${item.duration ? `- **Duration:** ${item.duration}` : ""}

${contentSection}

## Instructions
${formatInstructions}

Output a JSON object with this exact structure. Output ONLY the JSON object, no other text:
${SUMMARY_OUTPUT_SCHEMA}`;
}

export function chunkSummarizePrompt(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
): string {
  return `You are summarizing a chunk of a longer document. This is chunk ${chunkIndex + 1} of ${totalChunks}.

## Chunk Content
${chunk}

## Instructions
Summarize this chunk concisely. Focus on the main ideas, key facts, and important details. Output a JSON object with this exact structure. Output ONLY the JSON object, no other text:
${SUMMARY_OUTPUT_SCHEMA}`;
}

export function synthesizeChunkSummariesPrompt(
  chunkSummaries: string[],
  item: ContentItem,
): string {
  const summariesText = chunkSummaries
    .map((s, i) => `### Chunk ${i + 1}\n${s}`)
    .join("\n\n");

  return `You are synthesizing multiple chunk summaries into a single coherent summary for a longer document.

## Document Metadata
- **Title:** ${item.title}
- **Author:** ${item.author ?? "Unknown"}
- **Publication:** ${item.publication ?? "Unknown"}
- **Type:** ${item.contentType}
- **Topics:** ${item.topics.join(", ") || "None specified"}

## Chunk Summaries (JSON objects)
${summariesText}

## Instructions
Combine these chunk summaries into one unified summary. Deduplicate overlapping points, preserve the most important information, and create a coherent narrative. Output a JSON object with this exact structure. Output ONLY the JSON object, no other text:
${SUMMARY_OUTPUT_SCHEMA}`;
}
