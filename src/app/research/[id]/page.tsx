"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";
import { useParams, useRouter } from "next/navigation";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import { ResearchReportView } from "@/components/research/research-report-view";

/** How often to re-fetch the report when the SSE stream is unavailable. */
const POLL_INTERVAL_MS = 3000;

interface ResearchProgress {
  /** `synthesizing` comes from runs started before the outline/write stages; shown as outlining. */
  stage: "planning" | "researching" | "deepening" | "outlining" | "writing" | "synthesizing";
  current?: number;
  total?: number;
  question?: string;
  /** Heading of the section being written (`writing`). */
  heading?: string;
}

interface ResearchReport {
  id: string;
  itemId?: string | null;
  query: string;
  report: string;
  /** Legacy `string[]` or (from R2) source objects; normalised by the report view. */
  sources: unknown;
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
  "outlining",
  "writing",
];

function getStageIndex(stage: ResearchProgress["stage"]): number {
  const i = STAGES.indexOf(stage === "synthesizing" ? "outlining" : stage);
  return i >= 0 ? i : 0;
}

const STAGE_NAMES = new Set<string>([...STAGES, "synthesizing"]);

/**
 * Progress as the API and the stream send it: a JSON string (the read route and every SSE
 * event), an object, or, defensively, a JSON string of a JSON string. Anything without a known
 * stage is ignored.
 */
function parseResearchProgress(value: unknown): ResearchProgress | null {
  let parsed = value;
  for (let depth = 0; depth < 2 && typeof parsed === "string"; depth++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const stage = (parsed as { stage?: unknown }).stage;
  return typeof stage === "string" && STAGE_NAMES.has(stage) ? (parsed as ResearchProgress) : null;
}

/** Stepper label for one stage, with the live counts when that stage is current. */
function stageLabel(stage: ResearchProgress["stage"], progress: ResearchProgress | null): string {
  const done = progress ? getStageIndex(progress.stage) > getStageIndex(stage) : false;
  switch (stage) {
    case "planning":
      return "Planning research questions...";
    case "researching": {
      if (done) return "Researched sub-questions";
      const current = progress?.stage === "researching";
      const curr = current ? (progress.current ?? 0) : 0;
      const tot = current ? (progress.total ?? 1) : 1;
      const q = current ? progress.question : "";
      return `Researching (${curr}/${tot})${q ? `: ${q}` : ""}`;
    }
    case "deepening": {
      if (progress?.stage !== "deepening" || !progress.total) return "Deepening research...";
      const q = progress.question ? `: ${progress.question}` : "";
      return `Deepening (${progress.current ?? 0}/${progress.total})${q}`;
    }
    case "outlining":
    case "synthesizing":
      return "Outlining the report...";
    case "writing": {
      if (progress?.stage !== "writing" || !progress.total) return "Writing the report...";
      const heading = progress.heading ? `: ${progress.heading}` : "";
      return `Writing (${progress.current ?? 1}/${progress.total})${heading}`;
    }
  }
}

const BACK: ShortcutDef = {
  id: "report.back",
  keys: [{ key: "u" }],
  label: "Back",
  group: "Research",
  scope: "research",
};

export default function ResearchPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ResearchProgress | null>(null);

  const fetchReport = useCallback(async () => {
    const res = await fetch(`${config.apiBaseUrl}/api/ai/research/${id}`);
    if (!res.ok) throw new Error("Report not found");
    const data = await res.json();
    setReport(data.report);
    const parsed = parseResearchProgress(data.report.progress);
    if (parsed) setProgress(parsed);
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
          const p = parseResearchProgress(e.data);
          if (p) setProgress(p);
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

  const backHref = report ? (report.itemId ? `/feed/${report.itemId}` : "/research") : "/research";
  useShortcut(
    BACK,
    (e) => {
      e.preventDefault();
      router.push(backHref);
    },
    report !== null
  );

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

  const backLink = (
    <Link
      href={backHref}
      aria-keyshortcuts="u"
      title="Back (u)"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back
    </Link>
  );

  // Completed: the readable report page (reading column, TL;DR, contents, collapsed sources).
  if (report.status === "completed") {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-16">
        {backLink}
        <ResearchReportView report={report} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back navigation */}
      {backLink}

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

                const label = stageLabel(stage, progress);

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
    </div>
  );
}
