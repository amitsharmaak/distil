import type { ContentItem } from "@/lib/types";

/**
 * Temporary UI contract for Phase 2. These types intentionally do not mirror
 * persistence models: the platform stream will provide the final API types.
 */
export type KnowledgeItem = Partial<
  Pick<
    ContentItem,
    | "thumbnailUrl"
    | "readingMinutes"
    | "duration"
    | "url"
    | "publication"
    | "author"
    | "createdAt"
    | "contentType"
    | "priority"
    | "area"
    | "aiArea"
    | "aiSummary"
  >
> & {
  id: string;
  title: string;
  summary: string;
  source: string;
  href: string;
  isRead?: boolean;
  reason: string;
};
