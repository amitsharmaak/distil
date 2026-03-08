/**
 * TypeScript interfaces for the AI agent system.
 *
 * These types are used across all AI modules (summarization, feedback,
 * prioritization, research, preference learning).
 */

/** User's learned preference profile, stored as JSON in user_settings. */
export interface UserPreferenceProfile {
  /** Topic interest weights (0–1 scale). Higher = more interested. */
  topicWeights: Record<string, number>;
  /** Source type preference weights. */
  sourceWeights: Record<string, number>;
  /** Author preference weights. */
  authorWeights: Record<string, number>;
  /** Content type preference weights. */
  contentTypeWeights: Record<string, number>;
  /** Natural language summary of recent feedback patterns. */
  recentFeedbackSummary: string;
  /** ISO 8601 timestamp of last update. */
  lastUpdated: string;
}

/** User-configured agent settings, stored as JSON in user_settings. */
export interface AgentConfig {
  summaryLength: "brief" | "detailed";
  priorityWeights: {
    recency: number;
    topicRelevance: number;
    sourceReliability: number;
  };
  pollingFrequencyMinutes: number;
}

/** Default agent config used when no user config is saved. */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  summaryLength: "brief",
  priorityWeights: {
    recency: 0.7,
    topicRelevance: 0.9,
    sourceReliability: 0.6,
  },
  pollingFrequencyMinutes: 30,
};

/** Default (neutral) preference profile used when no feedback exists. */
export const DEFAULT_PREFERENCES: UserPreferenceProfile = {
  topicWeights: {},
  sourceWeights: {},
  authorWeights: {},
  contentTypeWeights: {},
  recentFeedbackSummary: "",
  lastUpdated: new Date().toISOString(),
};

/** An item with its computed AI priority score. */
export interface ScoredItem {
  itemId: string;
  score: number;
  priority: "high" | "medium" | "low";
}

/** Structured output from AI summarization (JSON mode). */
export interface SummaryOutput {
  overview: string;
  keyPoints: string[];
  whyItMatters?: string;
  notableQuotes?: string[];
}

/** Feedback entry joined with its corresponding item data. */
export interface FeedbackWithItem {
  feedbackId: string;
  itemId: string;
  rating: number;
  reason: string | null;
  feedbackDate: string;
  itemTitle: string;
  itemTopics: string[];
  itemSourceType: string;
  itemContentType: string;
  itemAuthor?: string;
}
