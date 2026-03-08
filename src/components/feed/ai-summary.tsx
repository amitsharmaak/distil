"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Zap, RefreshCw, Sparkles, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/lib/config";

interface AISummaryProps {
  itemId: string;
  ogSummary: string;
  fullContent?: string;
  initialAISummary?: string | null;
}

type ViewMode = "ai" | "original";

/**
 * Converts raw plain-text content (e.g. from Gmail) into readable HTML.
 * Turns URLs into links, blank lines into paragraph breaks, and strips
 * noisy tracking URLs.
 */
function formatRawContent(text: string): string {
  const lines = text.split("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
    } else {
      // Strip standalone tracking/redirect URLs in parentheses
      const cleaned = trimmed
        .replace(/\(\s*https?:\/\/api-esp[^\)]*\)/g, "")
        .replace(/\(\s*https?:\/\/[^\s\)]*(?:click|track|redirect|unsub|piano\.io)[^\)]*\)/g, "")
        .trim();
      if (cleaned) current.push(cleaned);
    }
  }
  if (current.length > 0) paragraphs.push(current.join(" "));

  return paragraphs
    .filter((p) => p.length > 0)
    .map((p) => {
      // Convert inline URLs to anchor tags
      const withLinks = p.replace(
        /(https?:\/\/[^\s<,)]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
      );
      return `<p>${withLinks}</p>`;
    })
    .join("\n");
}

function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content.slice(0, 500));
}

export function AISummary({ itemId, ogSummary, fullContent, initialAISummary }: AISummaryProps) {
  const [aiSummary, setAiSummary] = useState<string | null>(initialAISummary ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialAISummary ? "ai" : "original");

  const processedContent = useMemo(() => {
    if (!fullContent) return null;
    if (isHtmlContent(fullContent)) return fullContent;
    return formatRawContent(fullContent);
  }, [fullContent]);

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
      setViewMode("ai");
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
              {viewMode === "ai" && hasAISummary ? (
                <Zap className="h-3 w-3 text-primary" />
              ) : (
                <FileText className="h-3 w-3 text-primary" />
              )}
            </div>
            {viewMode === "ai" && hasAISummary ? "AI Summary" : "Original Content"}
          </CardTitle>
          <div className="flex items-center gap-1">
            {hasAISummary && (
              <div className="flex items-center rounded-md border border-border p-0.5">
                <Button
                  variant={viewMode === "ai" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-[11px] px-2 gap-1 rounded-sm"
                  onClick={() => setViewMode("ai")}
                >
                  <Zap className="h-3 w-3" />
                  AI Summary
                </Button>
                <Button
                  variant={viewMode === "original" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-[11px] px-2 gap-1 rounded-sm"
                  onClick={() => setViewMode("original")}
                >
                  <FileText className="h-3 w-3" />
                  Original
                </Button>
              </div>
            )}
            {hasAISummary && viewMode === "ai" && (
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

        {!loading && !error && viewMode === "ai" && aiSummary && (
          <div className="pia-ai-summary prose dark:prose-invert max-w-none prose-p:my-4 prose-p:leading-7 prose-headings:mt-6 prose-headings:mb-3 prose-headings:text-base prose-li:my-1.5 prose-li:leading-7 prose-ul:my-3 prose-ol:my-3 prose-strong:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary}</ReactMarkdown>
          </div>
        )}

        {!loading && !error && (viewMode === "original" || !aiSummary) && (
          <div>
            {processedContent ? (
              <div
                className="pia-reader prose dark:prose-invert max-w-none prose-p:my-4 prose-p:leading-7 prose-headings:mt-8 prose-headings:mb-4 prose-li:my-1.5 prose-blockquote:my-4 prose-img:rounded-lg prose-img:my-6 prose-pre:my-4 prose-hr:my-8 prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
                dangerouslySetInnerHTML={{ __html: processedContent }}
              />
            ) : (
              <p className="text-base leading-7 text-muted-foreground whitespace-pre-line">
                {ogSummary}
              </p>
            )}
            {!hasAISummary && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 mt-4"
                onClick={() => generate()}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate AI Summary
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
