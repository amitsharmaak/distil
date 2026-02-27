/**
 * Dashboard page — the home screen of PIA.
 *
 * This is an async Server Component: it fetches all content items directly
 * from the database (no HTTP round-trip) and passes them as props to the
 * three dashboard sub-components. This is the idiomatic Next.js App Router
 * pattern for server-driven pages.
 *
 * The child components (StatsOverview, PriorityFeed, ActivityTimeline) are
 * pure display components that accept `items` as a prop and have no client-
 * side interactivity, so they do NOT need "use client".
 */

import { getItems } from "@/lib/db";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { PriorityFeed } from "@/components/dashboard/priority-feed";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";

export default async function DashboardPage() {
  // Fetch all items directly from SQLite — no HTTP call needed in server context.
  const items = getItems();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your personalized information overview</p>
      </div>

      {/* Top stats row: total items, unread count, sources, topics */}
      <StatsOverview items={items} />

      {/* Two-column section: priority reading list + recent activity timeline */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PriorityFeed items={items} />
        </div>
        <div className="lg:col-span-2">
          <ActivityTimeline items={items} />
        </div>
      </div>
    </div>
  );
}
