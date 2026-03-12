/**
 * Prompt templates for feed prioritization and preference learning.
 *
 * Used by src/lib/ai/prioritize.ts and src/lib/ai/preferences.ts.
 */

import type { FeedbackWithItem, UserPreferenceProfile } from "@/lib/ai/types";

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
