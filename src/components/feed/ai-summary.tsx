"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Zap, RefreshCw, Sparkles, FileText, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

/** Renders structured AI summary in reader typography — same aesthetic as tweet/article content. */
function StructuredSummaryMarkdown({ content }: { content: string }) {
  const sections = useMemo(() => parseSummarySections(content), [content]);

  const baseProse =
    "prose dark:prose-invert max-w-none prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline";

  return (
    <div className="distil-reader space-y-5">
      {sections.map(({ title, body, key }) => {
        if (!body) return null;

        if (key === "tldr" || key === "tl-dr") {
          return (
            <div key={key} className={baseProse}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          );
        }

        if (key === "key-points") {
          return (
            <div key={key}>
              {title && (
                <p className="text-[10px] tracking-widest uppercase text-muted-foreground mb-3">
                  {title}
                </p>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  ul: ({ children }) => <ul className="list-none space-y-2 my-0">{children}</ul>,
                    li: ({ children }) => (
                    <li className="flex items-start gap-2.5">
                      <span className="mt-[0.52em] shrink-0 size-1.5 rounded-full bg-primary" />
                      <div className="min-w-0 [&>p]:my-0">{children}</div>
                    </li>
                  ),
                }}
              >
                {body}
              </ReactMarkdown>
            </div>
          );
        }

        if (key === "why-this-matters") {
          return (
            <div key={key} className="border-l-2 border-primary/50 pl-4 py-0.5">
              {title && (
                <p className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                  {title}
                </p>
              )}
              <div className={`${baseProse} prose-p:my-1`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
              </div>
            </div>
          );
        }

        if (key === "notable-quotes") {
          return (
            <div key={key}>
              {title && (
                <p className="text-[10px] tracking-widest uppercase text-muted-foreground mb-3">
                  {title}
                </p>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  ul: ({ children }) => <ul className="list-none space-y-3 my-0">{children}</ul>,
                  li: ({ children }) => (
                    <li className="border-l-2 border-border/50 pl-4 py-0.5 italic text-muted-foreground [&>p]:my-0">
                      {children}
                    </li>
                  ),
                }}
              >
                {body}
              </ReactMarkdown>
            </div>
          );
        }

        return (
          <div key={key} className={baseProse}>
            {title && (
              <p className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
                {title}
              </p>
            )}
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
    <div>
      {/* Controls bar — pill toggles with hairline separator */}
      <div className="flex flex-wrap items-center gap-2 min-w-0 mb-5">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {/* AI Summary / Original pill toggle */}
          {hasAISummary && (
            <div className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 p-0.5">
              <button
                onClick={() => setViewMode("ai")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                  viewMode === "ai"
                    ? "bg-foreground/65 text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Zap className="h-3 w-3" />
                AI Summary
              </button>
              <button
                onClick={() => setViewMode("original")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                  viewMode === "original"
                    ? "bg-foreground/65 text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <FileText className="h-3 w-3" />
                Original
              </button>
            </div>
          )}

          {/* Brief / Detailed pill toggle */}
          {hasAISummary && viewMode === "ai" && (
            <div className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 p-0.5">
              <button
                onClick={() => handleLengthChange("brief")}
                disabled={loading}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150 disabled:opacity-50",
                  summaryLength === "brief"
                    ? "bg-foreground/65 text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Minimize2 className="h-3 w-3" />
                Brief
              </button>
              <button
                onClick={() => handleLengthChange("detailed")}
                disabled={loading}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150 disabled:opacity-50",
                  summaryLength === "detailed"
                    ? "bg-foreground/65 text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Maximize2 className="h-3 w-3" />
                Detailed
              </button>
            </div>
          )}

          {/* Regenerate */}
          {hasAISummary && viewMode === "ai" && (
            <button
              onClick={() => generate(summaryLength, true)}
              disabled={loading}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              Regenerate
            </button>
          )}
        </div>

      </div>

      {/* Content — reader typography, no card container */}
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
              className="distil-reader prose dark:prose-invert max-w-none prose-p:my-[1.15em] prose-headings:mt-6 prose-headings:mb-3 prose-li:my-1 prose-blockquote:my-4 prose-img:rounded-lg prose-img:my-6 prose-pre:my-4 prose-hr:my-6 prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
              dangerouslySetInnerHTML={{ __html: processedContent }}
            />
          ) : (
            <p className="distil-reader whitespace-pre-line">{ogSummary}</p>
          )}
          {!hasAISummary && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 mt-5"
              onClick={() => generate(summaryLength)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate AI Summary
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
