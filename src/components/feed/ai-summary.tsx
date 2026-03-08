"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Zap, RefreshCw, Sparkles, FileText, Minimize2, Maximize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { config } from "@/lib/config";

interface AISummaryProps {
  itemId: string;
  ogSummary: string;
  fullContent?: string;
  initialBriefSummary?: string | null;
  initialDetailedSummary?: string | null;
}

type ViewMode = "ai" | "original";
type SummaryLength = "brief" | "detailed";

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

/** Parse markdown into sections by ## headers for structured rendering. */
function parseSummarySections(content: string): { title: string; body: string; key: string }[] {
  const parts = content.split(/(?=^## .+$)/m).filter(Boolean);
  return parts.map((part) => {
    const match = part.match(/^## (.+?)\n\n([\s\S]*)/);
    if (!match) return { title: "", body: part.trim(), key: "other" };
    const [, title, body] = match;
    const key = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    return { title: title.trim(), body: body.trim(), key };
  });
}

/** Renders structured AI summary markdown with section-specific styling. */
function StructuredSummaryMarkdown({ content }: { content: string }) {
  const sections = useMemo(() => parseSummarySections(content), [content]);

  return (
    <div className="pia-ai-summary space-y-6">
      {sections.map(({ title, body, key }) => {
        if (!body) return null;
        const baseProse =
          "prose dark:prose-invert max-w-none prose-p:leading-7 prose-headings:mt-0 prose-headings:mb-2 prose-headings:text-base prose-strong:text-foreground";
        if (key === "tldr" || key === "tl-dr") {
          return (
            <div key={key} className={`${baseProse} prose-p:text-base prose-p:my-3`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          );
        }
        if (key === "key-points") {
          return (
            <div key={key} className={baseProse}>
              <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
              <div className="space-y-1.5 pl-1">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    ul: ({ children }) => <ul className="list-none space-y-1.5 my-0">{children}</ul>,
                    li: ({ children }) => (
                      <li className="flex gap-2 text-sm leading-6">
                        <span className="text-primary mt-1.5 shrink-0 size-1.5 rounded-full bg-primary" />
                        <span>{children}</span>
                      </li>
                    ),
                  }}
                >
                  {body}
                </ReactMarkdown>
              </div>
            </div>
          );
        }
        if (key === "why-this-matters") {
          return (
            <div
              key={key}
              className="rounded-lg border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10"
            >
              <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
              <div className={`${baseProse} prose-p:my-2 prose-p:text-sm`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            </div>
          );
        }
        if (key === "notable-quotes") {
          return (
            <div key={key} className={baseProse}>
              <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
              <div className="space-y-3">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    ul: ({ children }) => <ul className="list-none space-y-3 my-0">{children}</ul>,
                    li: ({ children }) => (
                      <li className="border-l-2 border-primary/40 pl-4 py-1 text-sm italic text-muted-foreground">
                        {children}
                      </li>
                    ),
                  }}
                >
                  {body}
                </ReactMarkdown>
              </div>
            </div>
          );
        }
        return (
          <div key={key} className={baseProse}>
            <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

export function AISummary({ itemId, ogSummary, fullContent, initialBriefSummary, initialDetailedSummary }: AISummaryProps) {
  const [briefSummary, setBriefSummary] = useState<string | null>(initialBriefSummary ?? null);
  const [detailedSummary, setDetailedSummary] = useState<string | null>(initialDetailedSummary ?? null);
  const hasInitialSummary = !!(initialBriefSummary || initialDetailedSummary);
  const [summaryLength, setSummaryLength] = useState<SummaryLength>(
    !initialBriefSummary && initialDetailedSummary ? "detailed" : "brief",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(hasInitialSummary ? "ai" : "original");

  const aiSummary = summaryLength === "brief" ? briefSummary : detailedSummary;

  const processedContent = useMemo(() => {
    if (!fullContent) return null;
    if (isHtmlContent(fullContent)) return fullContent;
    return formatRawContent(fullContent);
  }, [fullContent]);

  async function generate(length: SummaryLength, force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, length, force }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate summary");
      }
      const data = await res.json();
      if (length === "brief") {
        setBriefSummary(data.summary);
      } else {
        setDetailedSummary(data.summary);
      }
      setSummaryLength(length);
      setViewMode("ai");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleLengthChange(length: SummaryLength) {
    const cached = length === "brief" ? briefSummary : detailedSummary;
    if (cached) {
      setSummaryLength(length);
      return;
    }
    await generate(length);
  }

  const hasAISummary = !!briefSummary || !!detailedSummary;

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
              <>
                <div className="flex items-center rounded-md border border-border p-0.5">
                  <Button
                    variant={summaryLength === "brief" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 text-[11px] px-2 gap-1 rounded-sm"
                    onClick={() => handleLengthChange("brief")}
                    disabled={loading}
                  >
                    <Minimize2 className="h-3 w-3" />
                    Brief
                  </Button>
                  <Button
                    variant={summaryLength === "detailed" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 text-[11px] px-2 gap-1 rounded-sm"
                    onClick={() => handleLengthChange("detailed")}
                    disabled={loading}
                  >
                    <Maximize2 className="h-3 w-3" />
                    Detailed
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => generate(summaryLength, true)}
                  disabled={loading}
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Regenerate
                </Button>
              </>
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
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => generate(summaryLength)}
            >
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && viewMode === "ai" && aiSummary && (
          <StructuredSummaryMarkdown content={aiSummary} />
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
                onClick={() => generate(summaryLength)}
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
