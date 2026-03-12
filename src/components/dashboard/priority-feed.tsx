/**
 * PriorityFeed — editorial "top stories" cards for the Today's Brief.
 *
 * Shows the top 5 unread items sorted by priority. The first card is larger
 * to create visual hierarchy, like a newspaper's lead story.
 */

import Link from "next/link";
import {
  Mail,
  Hash,
  Globe,
  Link as LinkIcon,
  Play,
  Headphones,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentItem, SourceType, ContentType } from "@/lib/types";
import { MarkReadButton } from "@/components/feed/mark-read-button";

const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  "browser-extension": Globe,
  manual: LinkIcon,
};

const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  "browser-extension": "Extension",
  manual: "Manual",
};

const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500",
  slack: "text-purple-500",
  "browser-extension": "text-orange-500",
  manual: "text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-200",
  medium: "bg-amber-500/10 text-amber-600 border-amber-200",
  low: "bg-green-500/10 text-green-600 border-green-200",
};

function ContentTypeIcon({ type }: { type: ContentType }) {
  if (type === "video") return <Play className="h-3 w-3" />;
  if (type === "podcast") return <Headphones className="h-3 w-3" />;
  return null;
}

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

interface PriorityFeedProps {
  items: ContentItem[];
}

export function PriorityFeed({ items }: PriorityFeedProps) {
  const priorityItems = items
    .filter((item) => !item.isRead)
    .sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 5);

  if (priorityItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center">
        <p className="font-serif text-lg text-muted-foreground">
          All caught up
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          No unread items right now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {priorityItems.map((item, index) => {
        const SourceIcon = sourceIcons[item.sourceType] ?? Globe;
        const isLead = index === 0;

        return (
          <Link
            key={item.id}
            href={`/feed/${item.id}?filter=unread`}
            className="group block"
          >
            <article
              className={cn(
                "relative rounded-xl border border-border bg-card transition-all hover:shadow-md",
                isLead ? "p-6" : "p-4",
              )}
            >
              {/* Unread accent */}
              <div className="absolute bottom-4 left-0 top-4 w-0.5 rounded-full bg-primary" />

              {/* Source & time */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <SourceIcon
                    className={`h-3.5 w-3.5 ${sourceColors[item.sourceType]}`}
                  />
                  <span>{sourceLabels[item.sourceType]}</span>
                  {item.publication && (
                    <>
                      <span className="text-border">&middot;</span>
                      <span>{item.publication}</span>
                    </>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(item.createdAt)}
                </span>
              </div>

              {/* Title */}
              <h3
                className={cn(
                  "font-serif font-semibold leading-snug tracking-tight",
                  isLead
                    ? "text-xl line-clamp-2"
                    : "text-base line-clamp-1",
                )}
              >
                {item.title}
              </h3>

              {/* Summary */}
              <p
                className={cn(
                  "mt-1.5 text-sm leading-relaxed text-muted-foreground",
                  isLead ? "line-clamp-3" : "line-clamp-2",
                )}
              >
                {item.summary}
              </p>

              {/* Footer */}
              <div className="mt-3 flex items-center gap-2">
                {item.contentType !== "article" && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <ContentTypeIcon type={item.contentType} />
                    {item.duration}
                  </Badge>
                )}
                {item.topics.slice(0, 3).map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {topic}
                  </span>
                ))}
                <div className="ml-auto flex items-center gap-1.5">
                  {item.author && (
                    <span className="text-[11px] text-muted-foreground">
                      {item.author}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${priorityColors[item.priority]}`}
                  >
                    {item.priority}
                  </Badge>
                  <MarkReadButton itemId={item.id} isRead={item.isRead} />
                </div>
              </div>
            </article>
          </Link>
        );
      })}
    </div>
  );
}
