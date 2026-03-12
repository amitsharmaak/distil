/**
 * StatsOverview — inline stat line for the Today's Brief header.
 *
 * Instead of four separate stat cards, this renders a single line of text
 * with key numbers. Calm, editorial, information-dense without visual weight.
 */

import type { ContentItem } from "@/lib/types";

interface StatsOverviewProps {
  items: ContentItem[];
}

export function StatsOverview({ items }: StatsOverviewProps) {
  const totalItems = items.length;
  const unreadCount = items.filter((i) => !i.isRead).length;
  const uniqueSources = new Set(items.map((i) => i.sourceType)).size;
  const uniqueTopics = new Set(items.flatMap((i) => i.topics)).size;

  if (totalItems === 0) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        No items yet. Connect a source or add a link to get started.
      </p>
    );
  }

  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {unreadCount > 0 ? (
        <>
          <span className="font-medium text-foreground">{unreadCount}</span>{" "}
          unread
        </>
      ) : (
        "All caught up"
      )}
      {" \u00b7 "}
      {totalItems} total {totalItems === 1 ? "item" : "items"}
      {" \u00b7 "}
      {uniqueSources} {uniqueSources === 1 ? "source" : "sources"}
      {" \u00b7 "}
      {uniqueTopics} {uniqueTopics === 1 ? "topic" : "topics"}
    </p>
  );
}
