/**
 * PriorityFeed — shows the top 5 unread items sorted by priority.
 *
 * Receives all items as a prop from the Dashboard server component and filters
 * + sorts them locally. No data fetching happens here.
 *
 * This is a pure display component with no client-side interactivity,
 * so it does NOT require "use client".
 */

import Link from "next/link";
import {
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
  Globe,
  Link as LinkIcon,
  Play,
  Headphones,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ContentItem, SourceType, ContentType } from "@/lib/types";

// ── Source icon + color mappings ───────────────────────────────────────────────

/** Maps each SourceType to its lucide-react icon component. */
const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  whatsapp: MessageCircle,
  twitter: Twitter,
  linkedin: Linkedin,
  "browser-extension": Globe,
  manual: LinkIcon,
};

/** Maps each SourceType to a Tailwind text colour class. */
const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500",
  slack: "text-purple-500",
  whatsapp: "text-green-500",
  twitter: "text-sky-500",
  linkedin: "text-blue-600",
  "browser-extension": "text-orange-500",
  manual: "text-gray-500",
};

/** Maps each priority level to badge colour classes. */
const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-200",
  medium: "bg-amber-500/10 text-amber-600 border-amber-200",
  low: "bg-green-500/10 text-green-600 border-green-200",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Renders a small icon for non-article content types (video / podcast). */
function ContentTypeIcon({ type }: { type: ContentType }) {
  if (type === "video") return <Play className="h-3 w-3" />;
  if (type === "podcast") return <Headphones className="h-3 w-3" />;
  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────

interface PriorityFeedProps {
  /** All content items — filtered and sorted to the top 5 unread by priority. */
  items: ContentItem[];
}

/**
 * Displays the top 5 unread items sorted high → medium → low priority.
 * Each item is a clickable link to its detail page (/feed/[id]).
 */
export function PriorityFeed({ items }: PriorityFeedProps) {
  // Filter to unread items and sort by priority (high first), then by date.
  const priorityItems = items
    .filter((item) => !item.isRead)
    .sort((a, b) => {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Priority Reading</CardTitle>
        <Link
          href="/feed"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>

      <CardContent className="space-y-3">
        {priorityItems.map((item) => {
          const SourceIcon = sourceIcons[item.sourceType];
          return (
            <Link
              key={item.id}
              href={`/feed/${item.id}`}
              className="group flex gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
            >
              {/* Source icon */}
              <div className="mt-0.5 shrink-0">
                <SourceIcon className={`h-4 w-4 ${sourceColors[item.sourceType]}`} />
              </div>

              {/* Item details */}
              <div className="flex-1 min-w-0">
                {/* Title + priority badge */}
                <div className="flex items-start gap-2">
                  <h3 className="text-sm font-medium leading-snug line-clamp-1 flex-1">
                    {item.title}
                  </h3>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${priorityColors[item.priority]}`}
                  >
                    {item.priority}
                  </Badge>
                </div>

                {/* Summary excerpt */}
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.summary}</p>

                {/* Tags: content type, topic tags, author */}
                <div className="mt-2 flex items-center gap-2">
                  {item.contentType !== "article" && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <ContentTypeIcon type={item.contentType} />
                      {item.duration}
                    </Badge>
                  )}
                  {item.topics.slice(0, 2).map((topic) => (
                    <Badge key={topic} variant="secondary" className="text-[10px]">
                      {topic}
                    </Badge>
                  ))}
                  {item.author && (
                    <span className="text-[10px] text-muted-foreground">by {item.author}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        {/* Empty state */}
        {priorityItems.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            All caught up — no unread items!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
