export type SourceType =
  | "slack"
  | "gmail"
  | "twitter"
  | "manual"
  | "browser-extension";

export type ContentType = "article" | "video" | "podcast";

export type Priority = "high" | "medium" | "low";

export interface ExtractedLink {
  text: string;
  url: string;
}

export interface ContentItem {
  id: string;
  title: string;
  summary: string;
  fullContent?: string;
  sourceType: SourceType;
  contentType: ContentType;
  topics: string[];
  author?: string;
  publication?: string;
  url: string;
  priority: Priority;
  isRead: boolean;
  createdAt: string;
  duration?: string;
  thumbnailUrl?: string;
  /** Hyperlinks extracted from article body on ingestion. */
  extractedLinks?: ExtractedLink[];
  /** AI-generated summary (joined from ai_summaries table on read). */
  aiSummary?: string;
}

export interface Topic {
  id: string;
  name: string;
  itemCount: number;
  isActive: boolean;
  color: string;
}

export interface Source {
  id: string;
  type: SourceType;
  name: string;
  isConnected: boolean;
  lastSynced?: string;
  itemCount: number;
  icon: string;
}

export interface Notification {
  id: string;
  itemId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  highPriorityItems: boolean;
}

export interface AgentSettings {
  summaryLength: "brief" | "detailed";
  priorityWeights: {
    recency: number;
    topicRelevance: number;
    sourceReliability: number;
  };
  pollingFrequencyMinutes: number;
}
