import { StatsOverview } from "@/components/dashboard/stats-overview";
import { PriorityFeed } from "@/components/dashboard/priority-feed";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your personalized information overview
        </p>
      </div>

      <StatsOverview />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PriorityFeed />
        </div>
        <div className="lg:col-span-2">
          <ActivityTimeline />
        </div>
      </div>
    </div>
  );
}
