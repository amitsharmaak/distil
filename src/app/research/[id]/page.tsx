"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";
import { useParams } from "next/navigation";

interface ResearchReport {
  id: string;
  item_id: string | null;
  query: string;
  report: string;
  sources: string[];
  model: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export default function ResearchPage() {
  const params = useParams();
  const id = params.id as string;
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let active = true;
    let pollTimer: NodeJS.Timeout;

    async function fetchReport() {
      try {
        const res = await fetch(`${config.apiBaseUrl}/api/ai/research/${id}`);
        if (!res.ok) throw new Error("Report not found");
        const data = await res.json();

        if (!active) return;
        setReport(data.report);

        // Poll until completed or failed.
        if (data.report.status === "pending" || data.report.status === "running") {
          pollTimer = setTimeout(fetchReport, 3000);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load report");
      }
    }

    fetchReport();

    return () => {
      active = false;
      clearTimeout(pollTimer);
    };
  }, [id]);

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

  const isLoading = report.status === "pending" || report.status === "running";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back navigation */}
      <Link
        href={report.item_id ? `/feed/${report.item_id}` : "/feed"}
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
          Started {new Date(report.created_at).toLocaleString()}
          {report.completed_at && ` · Completed ${new Date(report.completed_at).toLocaleString()}`}
        </p>
      </div>

      <Separator />

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">Researching...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Searching the web and compiling findings. This may take a minute.
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
          <Card>
            <CardContent className="pt-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.report}</ReactMarkdown>
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
