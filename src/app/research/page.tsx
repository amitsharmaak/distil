"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion, RefreshCw, Scan, Search, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeepResearch } from "@/components/feed/deep-research";
import { config } from "@/lib/config";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import { Kbd } from "@/components/ui/kbd";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import {
  CACHE_FRESHNESS,
  useContentCache,
  useContentQuery,
} from "@/lib/client-cache/content-cache";

const NEW_RESEARCH: ShortcutDef = {
  id: "research.new",
  keys: [{ key: "n" }],
  label: "New research",
  group: "Research",
  scope: "research",
};
const SCAN: ShortcutDef = {
  id: "research.scan",
  keys: [{ key: "s", shift: true }],
  label: "Scan for suggestions",
  group: "Research",
  scope: "research",
};

interface ResearchReportListItem {
  id: string;
  itemId?: string | null;
  query: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
}

interface ResearchSuggestion {
  id: string;
  topic: string;
  reason: string;
  suggestedQuery: string;
  sourceItemIds: string[];
  createdAt: string;
}

interface ResearchReportsResponse {
  reports: ResearchReportListItem[];
}

interface ResearchSuggestionsResponse {
  suggestions: ResearchSuggestion[];
}

const REPORTS_KEY = ["research", "list"] as const;
const SUGGESTIONS_KEY = ["research", "suggestions"] as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function updatedLabel(updatedAt: number): string {
  if (!updatedAt) return "Not updated yet";
  return `Last updated ${new Date(updatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function ResearchListPage() {
  const router = useRouter();
  const cache = useContentCache();
  const reportsQuery = useContentQuery<ResearchReportsResponse>({
    key: REPORTS_KEY,
    url: `${config.apiBaseUrl}/api/ai/research/list`,
    staleTime: CACHE_FRESHNESS.library,
  });
  const suggestionsQuery = useContentQuery<ResearchSuggestionsResponse>({
    key: SUGGESTIONS_KEY,
    url: `${config.apiBaseUrl}/api/ai/research/suggestions`,
    staleTime: CACHE_FRESHNESS.library,
  });
  const reports = reportsQuery.data?.reports ?? [];
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const loading = reportsQuery.isPending && !reportsQuery.data;
  const refreshError = reportsQuery.error ?? suggestionsQuery.error;
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    clustersFound: number;
    suggestionsSaved: number;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const newResearchRef = useRef<HTMLButtonElement>(null);

  async function refreshAll() {
    await Promise.all([reportsQuery.refetch(), suggestionsQuery.refetch()]);
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setScanError(null);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research/proactive`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scan failed");
      }
      const data = await res.json();
      setScanResult(data);
      await cache.invalidate(SUGGESTIONS_KEY);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleStartSuggestion(id: string) {
    setActionId(id);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research/suggestions/${id}/start`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start research");
      }
      const data = await res.json();
      if (data.report?.id) {
        cache.set(["research", "report", data.report.id], { report: data.report });
        await Promise.all([
          cache.invalidate(REPORTS_KEY),
          cache.invalidate(SUGGESTIONS_KEY),
          cache.invalidate(["research", "report", data.report.id]),
        ]);
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
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research/suggestions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      cache.set<ResearchSuggestionsResponse>(SUGGESTIONS_KEY, (current) => ({
        suggestions: (current?.suggestions ?? []).filter((suggestion) => suggestion.id !== id),
      }));
      await cache.invalidate(SUGGESTIONS_KEY);
    } finally {
      setActionId(null);
    }
  }

  useShortcut(NEW_RESEARCH, (e) => {
    e.preventDefault();
    newResearchRef.current?.click();
  });
  useShortcut(
    SCAN,
    (e) => {
      e.preventDefault();
      void handleScan();
    },
    !scanning && !loading
  );

  function getStatusBadgeVariant(status: string) {
    if (status === "completed") return "text-green-600 border-green-200";
    if (status === "failed") return "text-red-600 border-red-200";
    return "text-amber-600 border-amber-200";
  }

  if (reportsQuery.error && !reportsQuery.data) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <p className="text-sm text-destructive">
          {errorMessage(reportsQuery.error, "Failed to load reports")}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void reportsQuery.refetch()}>
          Try again
        </Button>
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
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={reportsQuery.isFetching || suggestionsQuery.isFetching}
              className="gap-2"
              aria-label="Refresh research"
            >
              <RefreshCw
                className={`h-4 w-4 ${reportsQuery.isFetching || suggestionsQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScan}
              disabled={scanning || loading}
              className="gap-2"
              aria-label="Scan for topics"
              aria-keyshortcuts="Shift+S"
              title="Scan for suggestions (Shift+S)"
            >
              <Scan className="h-4 w-4" />
              {scanning ? "Scanning…" : "Scan for topics"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {updatedLabel(Math.max(reportsQuery.dataUpdatedAt, suggestionsQuery.dataUpdatedAt))}
          </p>
        </div>
      </div>

      {refreshError && (reportsQuery.data || suggestionsQuery.data) && (
        <p role="alert" className="text-sm text-destructive">
          Refresh failed. Cached research is still shown.
        </p>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Research a topic</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Run deep research on anything—Distil will search the web and write a cited report.
          </p>
          <DeepResearch defaultQuery="">
            <Button
              ref={newResearchRef}
              variant="default"
              className="gap-2"
              aria-keyshortcuts="n"
              title="New research (n)"
            >
              <Search className="h-4 w-4" /> Deep Research
              <Kbd className="hidden bg-primary-foreground/20 text-primary-foreground sm:inline-flex">
                n
              </Kbd>
            </Button>
          </DeepResearch>
        </CardContent>
      </Card>

      {scanResult && (
        <div className="rounded-md border px-4 py-3 text-sm">
          {scanResult.suggestionsSaved > 0 ? (
            <p>
              Scanned <span className="font-medium">{scanResult.clustersFound}</span> topic{" "}
              {scanResult.clustersFound === 1 ? "cluster" : "clusters"} and saved{" "}
              <span className="font-medium">{scanResult.suggestionsSaved}</span> suggestion
              {scanResult.suggestionsSaved === 1 ? "" : "s"} for your review.
            </p>
          ) : scanResult.clustersFound > 0 ? (
            <p className="text-muted-foreground">
              Found {scanResult.clustersFound} topic{" "}
              {scanResult.clustersFound === 1 ? "cluster" : "clusters"}, but nothing new to suggest
              right now.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Not enough recent items to scan. Add more content and try again.
            </p>
          )}
        </div>
      )}
      {scanError && <p className="text-sm text-destructive">{scanError}</p>}

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Suggested topics</h2>
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
        <h2 className="text-sm font-semibold text-muted-foreground">Your reports</h2>
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
                Use <span className="font-medium">Research a topic</span> above, approve a
                suggestion, or start from any feed item.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <Link key={report.id} href={`/research/${report.id}`} prefetch={false}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium line-clamp-2">{report.query}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>
                            {new Date(report.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          {report.completedAt && (
                            <>
                              <span>·</span>
                              <span>
                                Completed{" "}
                                {new Date(report.completedAt).toLocaleDateString("en-US", {
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
