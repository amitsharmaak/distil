"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Zap, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/lib/config";

interface AISummaryProps {
  itemId: string;
  /** The original OG-tag summary from the item (fallback). */
  ogSummary: string;
  /** Full content if available. */
  fullContent?: string;
  /** Pre-loaded AI summary from server (if one exists). */
  initialAISummary?: string | null;
}

export function AISummary({ itemId, ogSummary, fullContent, initialAISummary }: AISummaryProps) {
  const [aiSummary, setAiSummary] = useState<string | null>(initialAISummary ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, length: "brief", force }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate summary");
      }
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const hasAISummary = !!aiSummary;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center">
              <Zap className="h-3 w-3 text-primary" />
            </div>
            {hasAISummary ? "AI Summary" : "Summary"}
          </CardTitle>
          {hasAISummary && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => generate(true)}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => generate()}>
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && aiSummary && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary}</ReactMarkdown>
          </div>
        )}

        {!loading && !error && !aiSummary && (
          <div>
            <p className="text-sm leading-relaxed text-muted-foreground mb-3">{ogSummary}</p>
            {fullContent && <p className="text-sm leading-relaxed mb-3">{fullContent}</p>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => generate()}>
              <Sparkles className="h-3.5 w-3.5" />
              Generate AI Summary
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
