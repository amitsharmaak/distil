"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion, Scan, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeepResearch } from "@/components/feed/deep-research";
import { config } from "@/lib/config";

interface ResearchReportListItem {
  id: string;
  item_id: string | null;
  query: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface ResearchSuggestion {
  id: string;
  topic: string;
  reason: string;
  suggestedQuery: string;
  sourceItemIds: string[];
  createdAt: string;
}

export default function ResearchListPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ResearchReportListItem[]>([]);
  const [suggestions, setSuggestions] = useState<ResearchSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    clustersFound: number;
    suggestionsSaved: number;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
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
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research/suggestions`);
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchSuggestions();
  }, [fetchReports, fetchSuggestions]);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setScanError(null);
    try {
      const res = await fetch(
        `${config.apiBaseUrl}/api/ai/research/proactive`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scan failed");
      }
      const data = await res.json();
      setScanResult(data);
      await fetchSuggestions();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleStartSuggestion(id: string) {
    setActionId(id);
    try {
      const res = await fetch(
        `${config.apiBaseUrl}/api/ai/research/suggestions/${id}/start`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start research");
      }
      const data = await res.json();
      await fetchSuggestions();
      if (data.report?.id) {
        router.push(`/research/${data.report.id}`);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setActionId(null);
    }
  }

  async function handleDismiss(id: string) {
    setActionId(id);
    try {
      const res = await fetch(
        `${config.apiBaseUrl}/api/ai/research/suggestions/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      await fetchSuggestions();
    } finally {
      setActionId(null);
    }
  }

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
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Research</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suggested topics, your reports, and ad-hoc deep research
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleScan}
          disabled={scanning || loading}
          className="gap-2 shrink-0"
        >
          <Scan className="h-4 w-4" />
          {scanning ? "Scanning…" : "Scan for topics"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Research a topic</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Run deep research on anything—Distil will search the web and write a cited report.
          </p>
          <DeepResearch defaultQuery="" />
        </CardContent>
      </Card>

      {scanResult && (
        <div className="rounded-md border px-4 py-3 text-sm">
          {scanResult.suggestionsSaved > 0 ? (
            <p>
              Scanned{" "}
              <span className="font-medium">{scanResult.clustersFound}</span>{" "}
              topic{" "}
              {scanResult.clustersFound === 1 ? "cluster" : "clusters"} and
              saved{" "}
              <span className="font-medium">{scanResult.suggestionsSaved}</span>{" "}
              suggestion
              {scanResult.suggestionsSaved === 1 ? "" : "s"} for your review.
            </p>
          ) : scanResult.clustersFound > 0 ? (
            <p className="text-muted-foreground">
              Found {scanResult.clustersFound} topic{" "}
              {scanResult.clustersFound === 1 ? "cluster" : "clusters"}, but
              nothing new to suggest right now.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Not enough recent items to scan. Add more content and try again.
            </p>
          )}
        </div>
      )}
      {scanError && (
        <p className="text-sm text-destructive">{scanError}</p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Suggested topics
          </h2>
          {suggestions.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">{s.topic}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                  <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2">
                    Query: {s.suggestedQuery}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionId === s.id}
                    onClick={() => handleDismiss(s.id)}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    disabled={actionId === s.id}
                    onClick={() => handleStartSuggestion(s.id)}
                  >
                    {actionId === s.id ? "Starting…" : "Research this"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Your reports
        </h2>
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
                Use <span className="font-medium">Research a topic</span> above,
                approve a suggestion, or start from any feed item.
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
    </div>
  );
}
