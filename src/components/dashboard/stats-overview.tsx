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

import Link from "next/link";
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
      icon: FileText,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      href: "/feed?showRead=true",
    },
    {
      label: "Unread",
      value: String(unreadCount),
      icon: Eye,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/feed",
    },
    {
      label: "Sources",
      value: String(uniqueSources),
      icon: Plug,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/sources",
    },
    {
      label: "Topics",
      value: String(uniqueTopics),
      icon: Hash,
      color: "text-violet-600",
      bg: "bg-violet-50",
      href: "/topics",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Link key={stat.label} href={stat.href} className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-3 p-3">
              {/* Icon badge */}
              <div className={`rounded-lg p-2 ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>

              {/* Stat text */}
              <div>
                <p className="text-xl font-bold leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
