"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";
import { useParams, useRouter } from "next/navigation";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import { ResearchReportView } from "@/components/research/research-report-view";
import {
  CACHE_FRESHNESS,
  useContentCache,
  useContentQuery,
} from "@/lib/client-cache/content-cache";

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

interface ResearchReportResponse {
  report: ResearchReport;
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}

function updatedLabel(updatedAt: number): string {
  if (!updatedAt) return "Not updated yet";
  return `Last updated ${new Date(updatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
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
  const id = typeof params.id === "string" ? params.id : "";
  const reportKey = useMemo(() => ["research", "report", id] as const, [id]);
  const cache = useContentCache();
  const reportQuery = useContentQuery<ResearchReportResponse>({
    key: reportKey,
    url: `${config.apiBaseUrl}/api/ai/research/${id}`,
    staleTime: CACHE_FRESHNESS.detail,
    enabled: Boolean(id),
  });
  const { refetch: refetchReport } = reportQuery;
  const report = reportQuery.data?.report ?? null;
  const shouldWatch = Boolean(report && !isTerminalStatus(report.status));
  const [liveProgress, setLiveProgress] = useState<{
    id: string;
    value: ResearchProgress;
  } | null>(null);
  const progress =
    liveProgress?.id === id ? liveProgress.value : parseResearchProgress(report?.progress);

  useEffect(() => {
    if (!id || !shouldWatch) return;

    let active = true;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInFlight = false;
    let pollAttempt = 0;
    let streamFailed = false;
    let completionRefreshStarted = false;

    const available = () =>
      document.visibilityState === "visible" &&
      (typeof navigator === "undefined" || navigator.onLine !== false);

    const stopStream = () => {
      es?.close();
      es = null;
    };

    const stopPoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    };

    const stopLiveUpdates = () => {
      stopStream();
      stopPoll();
    };

    const setCachedReport = (update: (current: ResearchReport) => ResearchReport) => {
      cache.set<ResearchReportResponse>(reportKey, (current) =>
        current ? { report: update(current.report) } : current
      );
    };

    const refreshCompletionOnce = async () => {
      if (completionRefreshStarted || !active) return;
      completionRefreshStarted = true;
      stopLiveUpdates();
      await refetchReport();
    };

    // Fallback when the stream errors or reaches its deadline. Failed polls back off, and a
    // single in-flight guard prevents overlapping requests when connectivity changes.
    const schedulePoll = () => {
      if (!active || !available() || pollTimer || pollInFlight) return;
      const delay = Math.min(POLL_INTERVAL_MS * 2 ** pollAttempt, 30_000);
      pollTimer = setTimeout(async () => {
        pollTimer = null;
        if (!active || !available() || pollInFlight) return;
        pollInFlight = true;
        try {
          const result = await refetchReport();
          if (!active) return;
          const status = result.data?.report.status;
          if (status && isTerminalStatus(status)) {
            stopLiveUpdates();
            return;
          }
          pollAttempt = result.error ? Math.min(pollAttempt + 1, 4) : 0;
        } finally {
          pollInFlight = false;
        }
        schedulePoll();
      }, delay);
    };

    const connectStream = () => {
      if (!active || !available() || es || streamFailed) return;
      const stream = new EventSource(`${config.apiBaseUrl}/api/ai/research/${id}/stream`);
      es = stream;
      stream.addEventListener("progress", (event) => {
        const nextProgress = parseResearchProgress(event.data);
        if (!nextProgress) return;
        setLiveProgress({ id, value: nextProgress });
        setCachedReport((current) => ({ ...current, progress: event.data }));
      });
      stream.addEventListener("status", (event) => {
        try {
          const value = JSON.parse(event.data) as { status?: unknown };
          if (typeof value.status !== "string") return;
          if (value.status === "completed") {
            void refreshCompletionOnce();
            return;
          }
          setCachedReport((current) => ({ ...current, status: value.status as string }));
          if (isTerminalStatus(value.status)) stopLiveUpdates();
        } catch {
          // Ignore malformed status events and keep the last valid cached state.
        }
      });
      stream.addEventListener("complete", () => {
        void refreshCompletionOnce();
      });
      const fallBackToPolling = () => {
        if (!active || es !== stream) return;
        streamFailed = true;
        stopStream();
        schedulePoll();
      };
      stream.addEventListener("timeout", fallBackToPolling);
      stream.addEventListener("error", fallBackToPolling);
    };

    const syncAvailability = () => {
      if (!available()) {
        stopLiveUpdates();
        void cache.cancel(reportKey);
        return;
      }
      if (streamFailed) schedulePoll();
      else connectStream();
    };

    document.addEventListener("visibilitychange", syncAvailability);
    window.addEventListener("online", syncAvailability);
    window.addEventListener("offline", syncAvailability);
    syncAvailability();
    return () => {
      active = false;
      stopLiveUpdates();
      document.removeEventListener("visibilitychange", syncAvailability);
      window.removeEventListener("online", syncAvailability);
      window.removeEventListener("offline", syncAvailability);
      void cache.cancel(reportKey);
    };
  }, [cache, id, refetchReport, reportKey, shouldWatch]);

  const backHref = report ? (report.itemId ? `/feed/${report.itemId}` : "/research") : "/research";
  useShortcut(
    BACK,
    (e) => {
      e.preventDefault();
      router.push(backHref);
    },
    report !== null
  );

  if (reportQuery.error && !report) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <h2 className="text-lg font-semibold">Error</h2>
        <p className="text-sm text-muted-foreground">
          {reportQuery.error instanceof Error ? reportQuery.error.message : "Failed to load report"}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void refetchReport()}>
          Try again
        </Button>
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

  const refreshControl = (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-2"
        disabled={reportQuery.isFetching}
        onClick={() => void refetchReport()}
        aria-label="Refresh report"
      >
        <RefreshCw className={`h-4 w-4 ${reportQuery.isFetching ? "animate-spin" : ""}`} />
        Refresh
      </Button>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {updatedLabel(reportQuery.dataUpdatedAt)}
      </p>
    </div>
  );

  const refreshError =
    reportQuery.error && report ? (
      <p role="alert" className="text-sm text-destructive">
        Refresh failed. The cached report is still shown.
      </p>
    ) : null;

  // Completed: the readable report page (reading column, TL;DR, contents, collapsed sources).
  if (report.status === "completed") {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-16">
        <div className="flex items-start justify-between gap-4">
          {backLink}
          {refreshControl}
        </div>
        {refreshError}
        <ResearchReportView report={report} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back navigation */}
      <div className="flex items-start justify-between gap-4">
        {backLink}
        {refreshControl}
      </div>
      {refreshError}

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
