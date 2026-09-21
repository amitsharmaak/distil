"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Circle,
  Copy,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";
import { useParams } from "next/navigation";
import { DeepResearch } from "@/components/feed/deep-research";

const Markdown = dynamic(() => import("@/components/markdown").then((module) => module.Markdown));

/** How often to re-fetch the report when the SSE stream is unavailable. */
const POLL_INTERVAL_MS = 3000;

interface ResearchProgress {
  stage: "planning" | "researching" | "deepening" | "synthesizing";
  current?: number;
  total?: number;
  question?: string;
}

interface ResearchReport {
  id: string;
  itemId?: string | null;
  query: string;
  report: string;
  sources: string[];
  model: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  progress?: string | null;
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

const STAGES: ResearchProgress["stage"][] = [
  "planning",
  "researching",
  "deepening",
  "synthesizing",
];

function getStageIndex(stage: ResearchProgress["stage"]): number {
  const i = STAGES.indexOf(stage);
  return i >= 0 ? i : 0;
}

function extractExecutiveSummary(report: string): string | null {
  const patterns = [
    /##\s*Executive\s+Summary\s*\n([\s\S]*?)(?=\n##\s|$)/i,
    /##\s*Summary\s*\n([\s\S]*?)(?=\n##\s|$)/i,
    /#\s*Executive\s+Summary\s*\n([\s\S]*?)(?=\n#\s|$)/i,
  ];
  for (const re of patterns) {
    const m = report.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function reportWithoutExecutiveSummary(report: string): string {
  const summary = extractExecutiveSummary(report);
  if (!summary) return report;
  const patterns = [
    /##\s*Executive\s+Summary\s*\n[\s\S]*?(?=\n##\s|$)/i,
    /##\s*Summary\s*\n[\s\S]*?(?=\n##\s|$)/i,
    /#\s*Executive\s+Summary\s*\n[\s\S]*?(?=\n#\s|$)/i,
  ];
  let result = report;
  for (const re of patterns) {
    result = result.replace(re, "").trim();
  }
  return result;
}

export default function ResearchPage() {
  const params = useParams();
  const id = params.id as string;
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ResearchProgress | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchReport = useCallback(async () => {
    const res = await fetch(`${config.apiBaseUrl}/api/ai/research/${id}`);
    if (!res.ok) throw new Error("Report not found");
    const data = await res.json();
    setReport(data.report);
    if (data.report.progress) {
      try {
        setProgress(
          typeof data.report.progress === "string"
            ? JSON.parse(data.report.progress)
            : data.report.progress
        );
      } catch {
        // ignore
      }
    }
    return data.report;
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let active = true;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const stopStream = () => {
      es?.close();
      es = null;
    };

    // Fallback when the stream errors or hits the server deadline: keep
    // re-fetching until the report reaches a terminal state.
    const pollUntilDone = () => {
      if (!active) return;
      pollTimer = setTimeout(async () => {
        try {
          const r = await fetchReport();
          if (!active) return;
          if (isTerminalStatus(r.status)) return;
        } catch {
          // keep polling; a transient failure should not strand the page
        }
        pollUntilDone();
      }, POLL_INTERVAL_MS);
    };

    async function load() {
      try {
        const r = await fetchReport();
        if (!active) return;
        if (isTerminalStatus(r.status)) return;
        // Connect SSE for progress
        es = new EventSource(`${config.apiBaseUrl}/api/ai/research/${id}/stream`);
        es.addEventListener("progress", (e) => {
          try {
            const p = JSON.parse(e.data) as ResearchProgress;
            setProgress(p);
          } catch {
            // ignore
          }
        });
        es.addEventListener("status", (e) => {
          try {
            const { status } = JSON.parse(e.data);
            setReport((prev) => (prev ? { ...prev, status } : null));
          } catch {
            // ignore
          }
        });
        es.addEventListener("complete", async () => {
          stopStream();
          await fetchReport();
        });
        es.addEventListener("timeout", () => {
          stopStream();
          pollUntilDone();
        });
        es.addEventListener("error", () => {
          stopStream();
          pollUntilDone();
        });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load report");
      }
    }

    void load();
    return () => {
      active = false;
      stopStream();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [id, fetchReport]);

  const handleCopyMarkdown = async () => {
    if (!report?.report) return;
    await navigator.clipboard.writeText(report.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-semibold">Error</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link href="/feed" className="text-sm hover:underline mt-2 inline-block">
          Back to feed
        </Link>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isLoading =
    report.status === "pending" ||
    report.status === "running" ||
    report.status === "planning" ||
    report.status === "researching" ||
    report.status === "deepening" ||
    report.status === "synthesizing";

  const currentStageIndex = progress ? getStageIndex(progress.stage) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back navigation */}
      <Link
        href={report.itemId ? `/feed/${report.itemId}` : "/research"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary">Research Report</Badge>
          <Badge
            variant="outline"
            className={
              report.status === "completed"
                ? "text-green-600 border-green-200"
                : report.status === "failed"
                  ? "text-red-600 border-red-200"
                  : "text-amber-600 border-amber-200"
            }
          >
            {report.status}
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{report.query}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Started {new Date(report.createdAt).toLocaleString()}
          {report.completedAt && ` · Completed ${new Date(report.completedAt).toLocaleString()}`}
        </p>
      </div>

      <Separator />

      {/* Progress stepper — during research */}
      {isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Research in progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {STAGES.map((stage, i) => {
                const isCompleted = currentStageIndex > i;
                const isCurrent = currentStageIndex === i;
                const isPending = currentStageIndex < i;

                let label = "";
                if (stage === "planning") label = "Planning research questions...";
                else if (stage === "researching") {
                  const curr = progress?.stage === "researching" ? (progress.current ?? 0) : 0;
                  const tot = progress?.stage === "researching" ? (progress.total ?? 1) : 1;
                  const q = progress?.stage === "researching" ? progress.question : "";
                  label = `Researching (${curr}/${tot})${q ? `: ${q}` : ""}`;
                } else if (stage === "deepening") label = "Deepening research...";
                else if (stage === "synthesizing") label = "Synthesizing findings...";

                return (
                  <div key={stage} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      {isCurrent && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                      {isPending && <Circle className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div
                      className={
                        isCompleted
                          ? "text-green-600"
                          : isCurrent
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                      }
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              You can navigate away — research continues in the background.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Failed state */}
      {report.status === "failed" && (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-sm">{report.report || "Research failed. Please try again."}</p>
          </CardContent>
        </Card>
      )}

      {/* Completed report */}
      {report.status === "completed" && (
        <>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyMarkdown}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied!" : "Copy as Markdown"}
            </Button>
            <DeepResearch defaultQuery={report.query} itemId={report.itemId ?? undefined}>
              <Button variant="outline" size="sm" className="gap-2">
                <Search className="h-4 w-4" /> Research Further
              </Button>
            </DeepResearch>
          </div>

          {/* Executive summary card */}
          {(() => {
            const summary = extractExecutiveSummary(report.report);
            if (!summary) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Executive Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <Markdown>{summary}</Markdown>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Report body */}
          <Card>
            <CardContent className="pt-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown>{reportWithoutExecutiveSummary(report.report)}</Markdown>
              </div>
            </CardContent>
          </Card>

          {/* Sources */}
          {report.sources.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Sources ({report.sources.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {report.sources.map((url, i) => (
                    <li key={i}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{url}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
