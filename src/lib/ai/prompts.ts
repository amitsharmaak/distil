/**
 * Prompt templates for all AI operations.
 *
 * Each function returns a string prompt. Keeping all prompts in one file
 * makes them easy to review, iterate, and test.
 */

import type { ContentItem } from "@/lib/types";
import type { FeedbackWithItem, UserPreferenceProfile } from "./types";

// ── Summarization ────────────────────────────────────────────────────────────

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
      ? `Format your response as:
1. A **TL;DR** in 2-3 sentences
2. **Key Points** as 3-5 bullet points`
      : `Format your response as:
1. A **TL;DR** in 2-3 sentences
2. **Key Points** as 5-8 bullet points
3. **Why This Matters** — a short paragraph on significance and implications
4. **Notable Quotes** — 1-3 key quotes if available in the content`;

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

Use clean markdown formatting. Be concise but informative. Focus on what the reader needs to know, not filler.`;
}

// ── Preference Analysis ──────────────────────────────────────────────────────

export function preferenceAnalysisPrompt(
  feedbackItems: FeedbackWithItem[],
): string {
  const feedbackList = feedbackItems
    .map(
      (f) =>
        `- ${f.rating === 1 ? "LIKED" : "DISLIKED"}: "${f.itemTitle}" (topics: ${f.itemTopics.join(", ")}, source: ${f.itemSourceType}, type: ${f.itemContentType}${f.itemAuthor ? `, author: ${f.itemAuthor}` : ""})${f.reason ? ` — Reason: "${f.reason}"` : ""}`,
    )
    .join("\n");

  return `You are analyzing a user's content preferences based on their feedback history. Your goal is to identify patterns in what they like and dislike.

## Feedback History
${feedbackList}

## Instructions
Analyze the patterns and output a JSON object with this exact structure:
{
  "topicWeights": { "topic_name": 0.0-1.0 },
  "sourceWeights": { "source_type": 0.0-1.0 },
  "authorWeights": { "author_name": 0.0-1.0 },
  "contentTypeWeights": { "content_type": 0.0-1.0 },
  "recentFeedbackSummary": "A 2-3 sentence natural language summary of the user's preferences"
}

Rules:
- Weights range from 0.0 (strongly dislikes) to 1.0 (strongly likes). 0.5 is neutral.
- Only include topics/sources/authors/types that appear in the feedback.
- The summary should be written as if describing the user to a content recommendation system.
- Output ONLY the JSON object, no other text.`;
}

// ── Prioritization ───────────────────────────────────────────────────────────

export function prioritizePrompt(
  items: { id: string; title: string; topics: string[]; sourceType: string; author?: string }[],
  preferences: UserPreferenceProfile,
): string {
  const itemList = items
    .map(
      (i) =>
        `- ID: ${i.id} | "${i.title}" | topics: ${i.topics.join(", ")} | source: ${i.sourceType}${i.author ? ` | author: ${i.author}` : ""}`,
    )
    .join("\n");

  return `You are a content prioritization assistant. Given the user's preference profile and a list of content items, rank them by likely interest.

## User Preference Profile
${preferences.recentFeedbackSummary || "No feedback yet — rank by general interest and recency."}

Topic interests: ${JSON.stringify(preferences.topicWeights)}
Source preferences: ${JSON.stringify(preferences.sourceWeights)}

## Items to Rank
${itemList}

## Instructions
Output a JSON array of objects with this structure, ordered from highest to lowest interest:
[{ "id": "item_id", "score": 0-100, "reason": "brief reason" }]

Score guidelines:
- 80-100: Highly relevant to user's interests
- 50-79: Moderately interesting
- 20-49: Low interest
- 0-19: Not relevant

Output ONLY the JSON array, no other text.`;
}

// ── Deep Research ────────────────────────────────────────────────────────────

export function researchPlanPrompt(
  query: string,
  context?: string,
): string {
  return `You are a research assistant. The user wants to learn more about a topic. Plan the research by identifying key questions to investigate.

## Research Topic
${query}

${context ? `## Context from Source Article\n${context}\n` : ""}

## Instructions
Identify 3-5 specific sub-questions that would give the user a comprehensive understanding of this topic. Consider:
- Background and fundamentals
- Current state and recent developments
- Key players and perspectives
- Implications and future outlook

Output a JSON array of strings (the sub-questions):
["question 1", "question 2", ...]

Output ONLY the JSON array, no other text.`;
}

export function researchSynthesizePrompt(
  query: string,
  findings: string,
): string {
  return `You are a research assistant synthesizing findings into a comprehensive report.

## Original Research Question
${query}

## Research Findings
${findings}

## Instructions
Write a well-structured research report in markdown with:

1. **Executive Summary** — 3-5 sentence overview of key findings
2. **Key Findings** — organized by theme, with inline source links where available
3. **Analysis** — connections between findings, implications, and your assessment
4. **Conclusion** — summary and suggested next steps for the reader

Use clean, professional markdown formatting. Include source links where they were provided in the findings. Write for a knowledgeable reader who wants depth but also clarity.`;
}
