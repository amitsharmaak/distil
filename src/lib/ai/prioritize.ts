/**
 * Prioritization module.
 *
 * Scores content items based on user preferences (learned from feedback)
 * and configurable weights. Uses a hybrid approach: fast heuristic scoring
 * by default, with optional AI-assisted ranking for deeper personalization.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { generateText, DEFAULT_MODEL } from "./client";
import { prioritizePrompt } from "./prompts";
import { getPreferences } from "./preferences";
import { getItems, updateItemPriorityScore, getUserSetting } from "@/lib/db";
import type { ContentItem, Priority } from "@/lib/types";
import type { AgentConfig, DEFAULT_AGENT_CONFIG, ScoredItem, UserPreferenceProfile } from "./types";

/** Load agent config from DB, falling back to defaults. */
function loadAgentConfig(): AgentConfig {
  const raw = getUserSetting("agent_config");
  if (!raw) {
    return {
      summaryLength: "brief",
      priorityWeights: { recency: 0.7, topicRelevance: 0.9, sourceReliability: 0.6 },
      pollingFrequencyMinutes: 30,
    };
  }
  return JSON.parse(raw) as AgentConfig;
}

/** Map a numeric score (0-100) to a priority label. */
function scoreToPriority(score: number): Priority {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Compute a heuristic priority score for an item (no API call).
 * Returns a score between 0 and 100.
 */
function heuristicScore(
  item: ContentItem,
  preferences: UserPreferenceProfile,
  config: AgentConfig,
): number {
  const weights = config.priorityWeights;

  // 1. Recency score (exponential decay — 100 for today, ~50 at 7 days, ~0 at 30 days)
  const ageMs = Date.now() - new Date(item.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 100 * Math.exp(-ageDays / 10));

  // 2. Topic relevance score
  let topicScore = 50; // neutral default
  if (item.topics.length > 0 && Object.keys(preferences.topicWeights).length > 0) {
    const topicScores = item.topics.map((t) => (preferences.topicWeights[t] ?? 0.5) * 100);
    topicScore = topicScores.reduce((a, b) => a + b, 0) / topicScores.length;
  }

  // 3. Source reliability score
  const sourceScore = (preferences.sourceWeights[item.sourceType] ?? 0.5) * 100;

  // 4. Author preference score
  const authorScore = item.author
    ? (preferences.authorWeights[item.author] ?? 0.5) * 100
    : 50;

  // 5. Content type preference
  const typeScore = (preferences.contentTypeWeights[item.contentType] ?? 0.5) * 100;

  // Weighted combination
  const totalWeight = weights.recency + weights.topicRelevance + weights.sourceReliability + 0.3 + 0.2;
  const rawScore =
    (recencyScore * weights.recency +
      topicScore * weights.topicRelevance +
      sourceScore * weights.sourceReliability +
      authorScore * 0.3 +
      typeScore * 0.2) /
    totalWeight;

  // Read penalty
  const finalScore = item.isRead ? rawScore * 0.3 : rawScore;

  return Math.round(Math.min(100, Math.max(0, finalScore)));
}

/**
 * Re-prioritize all unread items. Updates ai_priority_score and priority
 * fields in the database.
 *
 * @param useAI - If true, also uses Gemini for batch ranking refinement.
 * @returns Array of scored items.
 */
export async function reprioritize(useAI = false): Promise<ScoredItem[]> {
  const preferences = getPreferences();
  const agentConfig = loadAgentConfig();
  const items = getItems();

  // Step 1: Heuristic scoring for all items
  const scored: ScoredItem[] = items.map((item) => {
    const score = heuristicScore(item, preferences, agentConfig);
    return { itemId: item.id, score, priority: scoreToPriority(score) };
  });

  // Step 2: Optional AI-assisted refinement for top items
  if (useAI && items.length > 0) {
    const unreadItems = items.filter((i) => !i.isRead).slice(0, 20);
    if (unreadItems.length > 0) {
      try {
        const prompt = prioritizePrompt(
          unreadItems.map((i) => ({
            id: i.id,
            title: i.title,
            topics: i.topics,
            sourceType: i.sourceType,
            author: i.author,
          })),
          preferences,
        );

        const text = await generateText(prompt);

        const aiRanking = JSON.parse(text) as { id: string; score: number }[];

        // Merge AI scores with heuristic scores (weighted average)
        for (const aiItem of aiRanking) {
          const existing = scored.find((s) => s.itemId === aiItem.id);
          if (existing) {
            // 60% AI score, 40% heuristic
            existing.score = Math.round(aiItem.score * 0.6 + existing.score * 0.4);
            existing.priority = scoreToPriority(existing.score);
          }
        }
      } catch (error) {
        console.error("AI prioritization failed, using heuristic scores:", error);
      }
    }
  }

  // Step 3: Persist scores to database
  for (const s of scored) {
    updateItemPriorityScore(s.itemId, s.score, s.priority);
  }

  // Return sorted by score descending
  return scored.sort((a, b) => b.score - a.score);
}
