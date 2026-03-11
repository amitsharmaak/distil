/**
 * Prioritization module.
 *
 * Scores content items based on user preferences (learned from feedback)
 * and configurable weights. Uses a hybrid approach: fast heuristic scoring
 * by default, with optional AI-assisted ranking for deeper personalization.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { generateText } from "./router";
import { aiLogger } from "@/lib/logger";
import { prioritizePrompt } from "./prompts";
import { getPreferences } from "./preferences";
import { getItems, updateItemPriorityScore, getUserSetting } from "@/lib/db";
import type { ContentItem, Priority } from "@/lib/types";
import type { AgentConfig, ScoredItem, UserPreferenceProfile } from "./types";

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

function scoreToPriority(score: number): Priority {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function heuristicScore(
  item: ContentItem,
  preferences: UserPreferenceProfile,
  config: AgentConfig,
): number {
  const weights = config.priorityWeights;

  const ageMs = Date.now() - new Date(item.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 100 * Math.exp(-ageDays / 10));

  let topicScore = 50;
  if (item.topics.length > 0 && Object.keys(preferences.topicWeights).length > 0) {
    const topicScores = item.topics.map((t) => (preferences.topicWeights[t] ?? 0.5) * 100);
    topicScore = topicScores.reduce((a, b) => a + b, 0) / topicScores.length;
  }

  const sourceScore = (preferences.sourceWeights[item.sourceType] ?? 0.5) * 100;

  const authorScore = item.author
    ? (preferences.authorWeights[item.author] ?? 0.5) * 100
    : 50;

  const typeScore = (preferences.contentTypeWeights[item.contentType] ?? 0.5) * 100;

  const totalWeight = weights.recency + weights.topicRelevance + weights.sourceReliability + 0.3 + 0.2;
  const rawScore =
    (recencyScore * weights.recency +
      topicScore * weights.topicRelevance +
      sourceScore * weights.sourceReliability +
      authorScore * 0.3 +
      typeScore * 0.2) /
    totalWeight;

  const finalScore = item.isRead ? rawScore * 0.3 : rawScore;

  return Math.round(Math.min(100, Math.max(0, finalScore)));
}

/**
 * Re-prioritize all unread items. Updates ai_priority_score and priority
 * fields in the database.
 */
export async function reprioritize(useAI = false): Promise<ScoredItem[]> {
  const preferences = getPreferences();
  const agentConfig = loadAgentConfig();
  const items = getItems();

  const scored: ScoredItem[] = items.map((item) => {
    const score = heuristicScore(item, preferences, agentConfig);
    return { itemId: item.id, score, priority: scoreToPriority(score) };
  });

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

        const text = await generateText(prompt, "prioritize");
        const aiRanking = JSON.parse(text) as { id: string; score: number }[];

        for (const aiItem of aiRanking) {
          const existing = scored.find((s) => s.itemId === aiItem.id);
          if (existing) {
            existing.score = Math.round(aiItem.score * 0.6 + existing.score * 0.4);
            existing.priority = scoreToPriority(existing.score);
          }
        }
      } catch (error) {
        aiLogger.error({ err: error }, "AI prioritization failed, using heuristic scores");
      }
    }
  }

  for (const s of scored) {
    updateItemPriorityScore(s.itemId, s.score, s.priority);
  }

  return scored.sort((a, b) => b.score - a.score);
}
