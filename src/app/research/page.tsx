"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion, Scan, Search, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeepResearch } from "@/components/feed/deep-research";
import { config } from "@/lib/config";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import { Kbd } from "@/components/ui/kbd";
import type { ShortcutDef } from "@/lib/shortcuts/types";

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
  const newResearchRef = useRef<HTMLButtonElement>(null);

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
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research/proactive`, { method: "POST" });
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
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research/suggestions/${id}/start`, {
        method: "POST",
      });
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
      const res = await fetch(`${config.apiBaseUrl}/api/ai/research/suggestions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      await fetchSuggestions();
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

  if (error) {
    return (
      <PageContainer>
        <PageHeader title="Research" />
        <EmptyState title="Could not load research" description={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Research"
        description="Suggested topics, your reports, and ad-hoc deep research"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={scanning || loading}
            className="min-h-11 min-w-11 gap-2 shrink-0"
            aria-label="Scan for topics"
            aria-keyshortcuts="Shift+S"
            title="Scan for suggestions (Shift+S)"
          >
            <Scan className="h-4 w-4" />
            {scanning ? "Scanning…" : "Scan for topics"}
          </Button>
        }
      />

      <section className="border-y border-border py-6 space-y-3">
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
            className="min-h-11 min-w-11 gap-2"
            aria-keyshortcuts="n"
            title="New research (n)"
          >
            <Search className="h-4 w-4" /> Deep Research
            <Kbd className="hidden bg-primary-foreground/20 text-primary-foreground sm:inline-flex">
              n
            </Kbd>
          </Button>
        </DeepResearch>
      </section>

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
                    className="min-h-11 min-w-11"
                    variant="outline"
                    size="sm"
                    disabled={actionId === s.id}
                    onClick={() => handleDismiss(s.id)}
                  >
                    Dismiss
                  </Button>
                  <Button
                    className="min-h-11 min-w-11"
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
          <EmptyState
            title="No research reports yet"
            icon={<FileQuestion className="h-6 w-6" />}
            description="Use Research a topic above, approve a suggestion, or start from any feed item."
          />
        ) : (
          <div className="divide-y border-y border-border">
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`/research/${report.id}`}
                className="block py-5 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-xl font-medium line-clamp-2">{report.query}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{formatDate(report.createdAt)}</span>
                      {report.status === "completed" && report.completedAt && (
                        <>
                          <span>·</span>
                          <span>Completed {formatDate(report.completedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <StatusBadge
                    tone={
                      report.status === "completed"
                        ? "success"
                        : report.status === "failed"
                          ? "danger"
                          : "warning"
                    }
                    className="shrink-0"
                  >
                    {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                  </StatusBadge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
