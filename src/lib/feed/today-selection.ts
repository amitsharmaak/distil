import { toPlainText } from "@/lib/format";
import type { FeedItem } from "@/lib/feed/feed-query";
import type { KnowledgeItem } from "@/components/phase2/types";

/**
 * Today's selection is one feed read: the six highest-priority unread items,
 * plus the stale-resurfacing strip. Server (page) and client (fallback) ask
 * for exactly this; the mapping to the presentation shape lives here so both
 * render identically. Client-safe: no zod or other server-only imports.
 */
export const TODAY_FEED_QUERY = {
  sort: "priority",
  read: "false",
  limit: "6",
  resurface: "stale",
} as const;

export const REVISIT_REASON = "Unopened for two weeks · worth another look";

function sourceName(item: FeedItem): string {
  return item.publication || item.author || item.sourceType;
}

export function toKnowledgeItem(item: FeedItem): KnowledgeItem {
  return {
    id: item.id,
    title: item.title || "Untitled",
    summary: toPlainText(item.aiSummary || item.summary) || "No summary is available yet.",
    source: sourceName(item),
    href: `/feed/${item.id}`,
    isRead: item.isRead,
    reason: item.rank.reasons[0] || "Saved for your reading queue",
  };
}

export interface TodaySections {
  priority: KnowledgeItem[];
  revisiting: KnowledgeItem[];
}

export function todaySections(page: {
  items?: FeedItem[];
  resurfacedItems?: FeedItem[];
}): TodaySections {
  return {
    priority: (page.items ?? []).map(toKnowledgeItem),
    revisiting: (page.resurfacedItems ?? []).map((item) => ({
      ...toKnowledgeItem(item),
      reason: REVISIT_REASON,
    })),
  };
}
