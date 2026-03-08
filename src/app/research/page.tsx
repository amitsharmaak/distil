"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/lib/config";

interface ResearchReportListItem {
  id: string;
  item_id: string | null;
  query: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export default function ResearchListPage() {
  const [reports, setReports] = useState<ResearchReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReports() {
      try {
        const res = await fetch(`${config.apiBaseUrl}/api/ai/research/list`);
        if (!res.ok) throw new Error("Failed to load reports");
        const data = await res.json();
        setReports(data.reports ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reports");
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, []);

  function getStatusBadgeVariant(status: string) {
    if (status === "completed") return "text-green-600 border-green-200";
    if (status === "failed") return "text-red-600 border-red-200";
    return "text-amber-600 border-amber-200";
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Research</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your research reports
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">No research reports yet</p>
            <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
              Start one from any content item using the Deep Research button.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link key={report.id} href={`/research/${report.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-2">
                        {report.query}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>
                          {new Date(report.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </span>
                        {report.completed_at && (
                          <>
                            <span>·</span>
                            <span>
                              Completed{" "}
                              {new Date(
                                report.completed_at,
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 ${getStatusBadgeVariant(report.status)}`}
                    >
                      {report.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
