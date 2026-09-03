/**
 * Today's Brief — the home screen of Distil.
 *
 * Redesigned as an editorial "morning brief" that reads like a newsletter:
 * greeting + inline stats → priority reading → recent activity.
 *
 * Server Component — fetches directly from the database.
 */

import Link from "next/link";
import { getItems } from "@/lib/db";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { PriorityFeed } from "@/components/dashboard/priority-feed";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { ArrowRight } from "lucide-react";

export default async function TodayPage() {
  const items = getItems();

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {/* Editorial header */}
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Today&rsquo;s Brief
        </h1>
        <StatsOverview items={items} />
      </div>

      {/* Priority Reading */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <span className="distil-section-label">Priority Reading</span>
          <Link
            href="/feed"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <PriorityFeed items={items} />
      </section>

      {/* Recent Activity */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <span className="distil-section-label">Recent Activity</span>
          <Link
            href="/feed?showRead=true"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            See all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <ActivityTimeline items={items} />
      </section>
    </div>
  );
}
