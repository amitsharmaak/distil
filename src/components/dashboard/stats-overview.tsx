/**
 * StatsOverview — four stat cards at the top of the Dashboard.
 *
 * Displays: total items, unread count, active source count, unique topic count.
 * All values are computed from the `items` prop passed down by the Dashboard
 * server component — no direct data fetching happens here.
 *
 * This is a pure display component with no client-side interactivity,
 * so it does NOT require "use client".
 */

import { FileText, Eye, Plug, Hash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ContentItem } from "@/lib/types";

interface StatsOverviewProps {
  /** All content items — stats are computed from this array. */
  items: ContentItem[];
}

/**
 * Renders a 2×2 (or 4-column on large screens) grid of stat cards.
 * Each card shows a count, a label, and a secondary annotation.
 */
export function StatsOverview({ items }: StatsOverviewProps) {
  // ── Computed stats ──────────────────────────────────────────────────────────

  const totalItems = items.length;
  const unreadCount = items.filter((i) => !i.isRead).length;
  const unreadPercent = totalItems > 0 ? Math.round((unreadCount / totalItems) * 100) : 0;

  // Count distinct source types present in the data.
  const uniqueSources = new Set(items.map((i) => i.sourceType)).size;

  // Count distinct topic strings across all items.
  const uniqueTopics = new Set(items.flatMap((i) => i.topics)).size;

  // ── Stat card definitions ───────────────────────────────────────────────────

  const stats = [
    {
      label: "Total Items",
      value: String(totalItems),
      change: `${items.filter((i) => !i.isRead).length} unread`,
      icon: FileText,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      label: "Unread",
      value: String(unreadCount),
      change: `${unreadPercent}% of total`,
      icon: Eye,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Sources",
      value: String(uniqueSources),
      change: uniqueSources === 1 ? "1 active" : `${uniqueSources} active`,
      icon: Plug,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Topics",
      value: String(uniqueTopics),
      change: uniqueTopics === 1 ? "1 tracked" : `${uniqueTopics} tracked`,
      icon: Hash,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-5">
            {/* Icon badge */}
            <div className={`rounded-lg p-2.5 ${stat.bg}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>

            {/* Stat text */}
            <div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.change}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
