export type SourceType =
  | "slack"
  | "gmail"
  | "linkedin"
  | "twitter"
  | "manual"
  | "browser-extension";

export type ContentType = "article" | "video" | "podcast";

export type Priority = "high" | "medium" | "low";

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

export interface AgentSettings {
  summaryLength: "brief" | "detailed";
  priorityWeights: {
    recency: number;
    topicRelevance: number;
    sourceReliability: number;
  };
  pollingFrequencyMinutes: number;
}
