/**
 * ActivityTimeline — compact recent activity list for Today's Brief.
 *
 * Shows the 8 most recently saved items as a vertical timeline
 * with source indicators and relative timestamps.
 */

import Link from "next/link";
import { Mail, Hash, Globe, Link as LinkIcon } from "lucide-react";
import type { ContentItem, SourceType } from "@/lib/types";

const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  "browser-extension": Globe,
  manual: LinkIcon,
};

const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500 bg-red-500/10",
  slack: "text-purple-500 bg-purple-500/10",
  "browser-extension": "text-orange-500 bg-orange-500/10",
  manual: "text-muted-foreground bg-muted",
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface ActivityTimelineProps {
  items: ContentItem[];
}

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  const recentItems = [...items]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 8);

  if (recentItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center">
        <p className="text-sm text-muted-foreground">No items saved yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {recentItems.map((item, i) => {
        const SourceIcon = sourceIcons[item.sourceType] ?? Globe;
        const colors =
          sourceColors[item.sourceType] ?? "text-muted-foreground bg-muted";

        return (
          <Link
            key={item.id}
            href={`/feed/${item.id}`}
            className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 first:rounded-t-xl last:rounded-b-xl"
          >
            {/* Source icon */}
            <div className={`shrink-0 rounded-full p-1.5 ${colors}`}>
              <SourceIcon className="h-3 w-3" />
            </div>

            {/* Title + metadata */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-snug">
                {item.title}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{item.publication || item.sourceType}</span>
                <span>&middot;</span>
                <span>{timeAgo(item.createdAt)}</span>
              </div>
            </div>

            {/* Unread dot */}
            {!item.isRead && (
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
