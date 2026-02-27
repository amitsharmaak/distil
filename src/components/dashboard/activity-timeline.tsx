/**
 * ActivityTimeline — shows the 8 most recently added items as a vertical timeline.
 *
 * Receives all items as a prop from the Dashboard server component and sorts
 * them locally by createdAt. No data fetching happens here.
 *
 * This is a pure display component with no client-side interactivity,
 * so it does NOT require "use client".
 */

import {
  Mail,
  Hash,
  MessageCircle,
  Twitter,
  Linkedin,
  Globe,
  Link as LinkIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentItem, SourceType } from "@/lib/types";

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

/** Maps each SourceType to combined text + background colour classes. */
const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500 bg-red-500/10",
  slack: "text-purple-500 bg-purple-500/10",
  whatsapp: "text-green-500 bg-green-500/10",
  twitter: "text-sky-500 bg-sky-500/10",
  linkedin: "text-blue-600 bg-blue-600/10",
  "browser-extension": "text-orange-500 bg-orange-500/10",
  manual: "text-gray-500 bg-gray-500/10",
};

// ── Helper ─────────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string (e.g. "3h ago", "2d ago").
 * Used to display how long ago each item was saved.
 */
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

// ── Main component ─────────────────────────────────────────────────────────────

interface ActivityTimelineProps {
  /** All content items — sorted to the 8 most recent for display. */
  items: ContentItem[];
}

/**
 * Renders a vertical timeline of the 8 most recently saved items.
 * Each entry shows the source icon, item title, publication/source, and
 * a relative timestamp.
 */
export function ActivityTimeline({ items }: ActivityTimelineProps) {
  // Sort newest first, take top 8.
  const recentItems = [...items]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {recentItems.map((item, i) => {
            const SourceIcon = sourceIcons[item.sourceType];
            const colors = sourceColors[item.sourceType];

            return (
              <div key={item.id} className="flex gap-3">
                {/* Source icon + vertical connector line */}
                <div className="flex flex-col items-center">
                  <div className={`rounded-full p-1.5 ${colors}`}>
                    <SourceIcon className="h-3 w-3" />
                  </div>
                  {/* Draw a line between entries, but not after the last one */}
                  {i < recentItems.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>

                {/* Item title + metadata */}
                <div className="flex-1 pb-4">
                  <p className="text-sm font-medium leading-snug line-clamp-1">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {/* Show publication name if available, otherwise the source type */}
                      {item.publication || item.sourceType}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {recentItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No items saved yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
