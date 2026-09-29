"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Zap, RefreshCw, Sparkles, FileText, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const Markdown = dynamic(() => import("@/components/markdown").then((module) => module.Markdown));

export interface AISummaryProps {
  itemId: string;
  ogSummary: string;
  /** HTML is sanitized by the server page before it crosses the client boundary. */
  fullContent?: string;
  fullContentIsHtml?: boolean;
  initialBriefSummary?: string | null;
  initialDetailedSummary?: string | null;
}

type ViewMode = "ai" | "original";
type SummaryLength = "brief" | "detailed";

/** Parse markdown into sections by ## headers for structured rendering. */
function parseSummarySections(content: string): { title: string; body: string; key: string }[] {
  const parts = content.split(/(?=^## .+$)/m).filter(Boolean);
  return parts.map((part) => {
    const match = part.match(/^## (.+?)\n\n([\s\S]*)/);
    if (!match) return { title: "", body: part.trim(), key: "other" };
    const [, title, body] = match;
    const key = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return { title: title.trim(), body: body.trim(), key };
  });
}

type SectionStyle = "lead" | "bullets" | "steps" | "quotes" | "callout" | "prose";

/**
 * How a section is styled. Content-aware briefs name their sections per piece, so the style
 * follows the section's markdown shape (a bullet list, a numbered list, block quotes, prose);
 * the fixed v1 headings keep their established treatment.
 */
function sectionStyle(key: string, body: string): SectionStyle {
  if (key === "tldr" || key === "tl-dr") return "lead";
  if (key === "why-this-matters") return "callout";
  if (key === "notable-quotes") return "quotes";
  const lines = body.split("\n").filter((line) => line.trim());
  if (lines.length === 0) return "prose";
  if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) return "bullets";
  if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) return "steps";
  if (lines.every((line) => /^\s*>/.test(line))) return "quotes";
  return "prose";
}

const sectionLabel = "text-[11px] font-medium tracking-widest uppercase text-muted-foreground";

/** Renders structured AI summary in reader typography — same aesthetic as tweet/article content. */
function StructuredSummaryMarkdown({ content }: { content: string }) {
  const sections = useMemo(() => parseSummarySections(content), [content]);

  // Element styling comes from `.distil-reader` in globals.css.
  const baseProse = "max-w-none";

  return (
    <div className="distil-reader space-y-5">
      {sections.map(({ title, body, key }, index) => {
        if (!body) return null;
        const style = sectionStyle(key, body);
        const sectionKey = `${key}-${index}`;
        const label = (spacing: string) =>
          title ? <p className={`${sectionLabel} ${spacing}`}>{title}</p> : null;

        if (style === "lead") {
          return (
            <div key={sectionKey} className={baseProse}>
              <Markdown>{body}</Markdown>
            </div>
          );
        }

        if (style === "bullets") {
          return (
            <div key={sectionKey} data-section-style="bullets">
              {label("mb-3")}
              <Markdown
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
              </Markdown>
            </div>
          );
        }

        if (style === "steps") {
          return (
            <div key={sectionKey} data-section-style="steps">
              {label("mb-3")}
              <Markdown
                components={{
                  ol: ({ children }) => (
                    <ol className="list-decimal marker:text-primary marker:font-medium space-y-2 my-0 pl-5">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => <li className="pl-1 [&>p]:my-0">{children}</li>,
                }}
              >
                {body}
              </Markdown>
            </div>
          );
        }

        if (style === "callout") {
          return (
            <div key={sectionKey} className="border-l-2 border-primary/50 pl-4 py-0.5">
              {label("mb-2")}
              <div className={`${baseProse} [&_p]:my-1`}>
                <Markdown>{body}</Markdown>
              </div>
            </div>
          );
        }

        if (style === "quotes") {
          return (
            <div key={sectionKey} data-section-style="quotes">
              {label("mb-3")}
              <div className="space-y-3">
                <Markdown
                  components={{
                    ul: ({ children }) => <ul className="list-none space-y-3 my-0">{children}</ul>,
                    li: ({ children }) => (
                      <li className="border-l-2 border-border/50 pl-4 py-0.5 italic text-muted-foreground [&>p]:my-0">
                        {children}
                      </li>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-border/50 pl-4 py-0.5 my-0 italic text-muted-foreground [&>p]:my-0">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {body}
                </Markdown>
              </div>
            </div>
          );
        }

        return (
          <div key={sectionKey} className={baseProse}>
            {label("mb-2")}
            <Markdown>{body}</Markdown>
          </div>
        );
      })}
    </div>
  );
}

export function AISummary({
  itemId,
  ogSummary,
  fullContent,
  fullContentIsHtml = false,
  initialBriefSummary,
  initialDetailedSummary,
}: AISummaryProps) {
  const [briefSummary, setBriefSummary] = useState<string | null>(initialBriefSummary ?? null);
  const [detailedSummary, setDetailedSummary] = useState<string | null>(
    initialDetailedSummary ?? null
  );
  const hasInitialSummary = !!(initialBriefSummary || initialDetailedSummary);
  const [summaryLength, setSummaryLength] = useState<SummaryLength>(
    !initialBriefSummary && initialDetailedSummary ? "detailed" : "brief"
  );
  const [loading, setLoading] = useState(false);
  const [retryRequest, setRetryRequest] = useState<{
    length: SummaryLength;
    force: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(hasInitialSummary ? "ai" : "original");

  const aiSummary = summaryLength === "brief" ? briefSummary : detailedSummary;

  async function generate(length: SummaryLength, force = false) {
    setLoading(true);
    setRetryRequest({ length, force });
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, length, force }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : data.error?.message || "Failed to generate summary"
        );
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
                    : "text-muted-foreground hover:text-foreground"
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
                    : "text-muted-foreground hover:text-foreground"
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
                    : "text-muted-foreground hover:text-foreground"
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
                    : "text-muted-foreground hover:text-foreground"
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
            onClick={() =>
              generate(retryRequest?.length ?? summaryLength, retryRequest?.force ?? false)
            }
          >
            Try Again
          </Button>
        </div>
      )}

      {!loading && viewMode === "ai" && aiSummary && (
        <StructuredSummaryMarkdown content={aiSummary} />
      )}

      {!loading && (viewMode === "original" || !aiSummary) && (
        <div>
          {fullContent && fullContentIsHtml ? (
            <div
              className="distil-reader max-w-none"
              dangerouslySetInnerHTML={{ __html: fullContent }}
            />
          ) : fullContent ? (
            <p className="distil-reader whitespace-pre-line">{fullContent}</p>
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
