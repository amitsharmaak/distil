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

/** The kind of piece a brief summary was shaped for (summary-v2). */
export const SUMMARY_SHAPES = [
  "argument",
  "news",
  "how-to",
  "research",
  "conversation",
  "meeting-note",
  "product",
  "list",
  "other",
] as const;
export type SummaryShape = (typeof SUMMARY_SHAPES)[number];

export const SUMMARY_SECTION_FORMATS = ["bullets", "steps", "paragraph", "quotes"] as const;
export type SummarySectionFormat = (typeof SUMMARY_SECTION_FORMATS)[number];

export interface SummarySection {
  heading: string;
  format: SummarySectionFormat;
  items: string[];
}

/**
 * Structured output of the content-aware brief (summary-v2): an overview plus sections chosen
 * for this piece, and the questions the brief leaves open. The open questions are stored but
 * not rendered; the detailed summary answers them.
 */
export interface BriefSummaryOutput {
  shape: SummaryShape;
  overview: string;
  sections: SummarySection[];
  openQuestions: string[];
}

/** Structured output of the detailed summary (JSON mode; the summary-v1 template). */
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
