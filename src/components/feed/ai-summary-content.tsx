"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useReaderExperience } from "@/components/feed/reader-experience";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";

const TOGGLE_VIEW: ShortcutDef = {
  id: "reader.toggleSummary",
  keys: [{ key: "s" }],
  label: "Toggle AI summary / original",
  group: "Reading",
  scope: "reader",
};
const TOGGLE_LENGTH: ShortcutDef = {
  id: "reader.toggleLength",
  keys: [{ key: "d" }],
  label: "Toggle brief / detailed",
  group: "Reading",
  scope: "reader",
};
const REGENERATE: ShortcutDef = {
  id: "reader.regenerate",
  keys: [{ key: "s", shift: true }],
  label: "Regenerate summary",
  group: "Reading",
  scope: "reader",
};

const Markdown = dynamic(() => import("@/components/markdown").then((module) => module.Markdown));

export interface AISummaryProps {
  itemId: string;
  ogSummary: string;
  /** HTML is sanitized by the server page before it crosses the client boundary. */
  fullContent?: string;
  fullContentIsHtml?: boolean;
  initialBriefSummary?: string | null;
  initialDetailedSummary?: string | null;
  emptyOriginalMessage?: string;
}

type ViewMode = "ai" | "original";
type SummaryLength = "brief" | "detailed";

interface SummarySectionBlock {
  title: string;
  body: string;
  key: string;
  /** Detailed summaries: the brief section or open question this section expands. */
  deepens?: string;
}

/** The divider a detailed summary puts between the brief and the delta sections. */
const GOING_DEEPER_KEY = "going-deeper";
const DEEPENS_LINE = /^_Expands on: (.+)_\n*/;

/** Parse markdown into sections by ## headers for structured rendering. */
function parseSummarySections(content: string): SummarySectionBlock[] {
  const parts = content.split(/(?=^## .+$)/m).filter(Boolean);
  return parts.map((part) => {
    const match = part.match(/^## (.+?)(?:\n\n([\s\S]*))?$/);
    if (!match) return { title: "", body: part.trim(), key: "other" };
    const [, title, rawBody = ""] = match;
    const key = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const body = rawBody.trim();
    const deepens = body.match(DEEPENS_LINE);
    if (deepens) {
      return {
        title: title.trim(),
        body: body.slice(deepens[0].length).trim(),
        key,
        deepens: deepens[1].replace(/\\([\\_*])/g, "$1"),
      };
    }
    return { title: title.trim(), body, key };
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

const sectionLabel =
  "font-sans text-xs font-medium tracking-widest uppercase text-muted-foreground";

/** Renders structured AI summary in reader typography — same aesthetic as tweet/article content. */
function StructuredSummaryMarkdown({ content }: { content: string }) {
  const sections = useMemo(() => parseSummarySections(content), [content]);

  // Element styling comes from `.distil-reader` in globals.css.
  const baseProse = "max-w-none";

  return (
    <div className="distil-reader space-y-5">
      {sections.map(({ title, body, key, deepens }, index) => {
        const sectionKey = `${key}-${index}`;
        if (key === GOING_DEEPER_KEY && !body) {
          return (
            <div
              key={sectionKey}
              role="separator"
              aria-label={title}
              className="flex items-center gap-3 pt-3"
            >
              <span className="h-px flex-1 bg-border" />
              <span className={sectionLabel}>{title}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          );
        }
        if (!body) return null;
        const style = sectionStyle(key, body);
        const label = (spacing: string) =>
          title ? (
            <div className={spacing}>
              <p className={sectionLabel}>{title}</p>
              {deepens && (
                <p className="mt-1 text-xs text-muted-foreground">Expands on: {deepens}</p>
              )}
            </div>
          ) : null;

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
                      <span className="mt-[0.52em] shrink-0 size-1.5 rounded-full bg-foreground/60" />
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
                    <ol className="list-decimal marker:text-foreground marker:font-medium space-y-2 my-0 pl-5">
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
            <div key={sectionKey} className="border-l-2 border-border pl-4 py-0.5">
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
  emptyOriginalMessage,
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

  const generate = useCallback(
    async (length: SummaryLength, force = false) => {
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
          // The detailed summary is a delta over the brief; a new brief makes it stale.
          if (!data.cached) setDetailedSummary(null);
        } else {
          setDetailedSummary(data.summary);
          if (data.briefSummary) setBriefSummary(data.briefSummary);
        }
        setSummaryLength(length);
        setViewMode("ai");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [itemId]
  );

  async function handleLengthChange(length: SummaryLength) {
    const cached = length === "brief" ? briefSummary : detailedSummary;
    if (cached) {
      setSummaryLength(length);
      return;
    }
    await generate(length);
  }

  const hasAISummary = !!briefSummary || !!detailedSummary;
  const reader = useReaderExperience();
  const setSummaryAction = reader?.setSummaryAction;
  useEffect(() => {
    setSummaryAction?.(
      hasAISummary
        ? { regenerate: () => void generate(summaryLength, true), disabled: loading }
        : null
    );
    return () => setSummaryAction?.(null);
  }, [setSummaryAction, hasAISummary, generate, summaryLength, loading]);

  useShortcut(
    TOGGLE_VIEW,
    () => setViewMode((mode) => (mode === "ai" ? "original" : "ai")),
    hasAISummary
  );
  useShortcut(
    TOGGLE_LENGTH,
    () => void handleLengthChange(summaryLength === "brief" ? "detailed" : "brief"),
    hasAISummary && viewMode === "ai" && !loading
  );
  useShortcut(
    REGENERATE,
    () => void generate(summaryLength, true),
    hasAISummary && viewMode === "ai" && !loading
  );

  const original =
    fullContent && fullContentIsHtml ? (
      <div className="distil-reader max-w-none" dangerouslySetInnerHTML={{ __html: fullContent }} />
    ) : (
      <p className="distil-reader whitespace-pre-line">
        {fullContent ||
          ogSummary ||
          emptyOriginalMessage ||
          "Open the original to read this story."}
      </p>
    );
  const generateButton = !hasAISummary && (
    <Button
      variant="outline"
      className="mt-5 min-h-11 gap-2"
      disabled={loading}
      onClick={() => void generate(summaryLength)}
    >
      <Sparkles className="h-4 w-4" /> Generate AI Summary
    </Button>
  );
  return (
    <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-2 border-b">
        <TabsList variant="line" aria-label="Reader view" className="h-11 justify-start p-0">
          <TabsTrigger value="ai" aria-keyshortcuts="s" className="min-h-11 flex-none px-2">
            Summary
          </TabsTrigger>
          <TabsTrigger value="original" aria-keyshortcuts="s" className="min-h-11 flex-none px-2">
            Original
          </TabsTrigger>
        </TabsList>
        {hasAISummary && viewMode === "ai" && (
          <div aria-keyshortcuts="d" title="Brief / detailed · D">
            <SegmentedControl
              aria-label="Summary length"
              value={summaryLength}
              onValueChange={(length) => void handleLengthChange(length)}
              className="bg-transparent p-0 [&_button]:bg-transparent [&_button]:shadow-none [&_button]:underline-offset-8 [&_button[aria-checked=true]]:underline"
              options={[
                { value: "brief", label: "Brief", disabled: loading },
                { value: "detailed", label: "Detailed", disabled: loading },
              ]}
            />
          </div>
        )}
      </div>
      {error && (
        <div className="mb-4 text-sm text-danger" role="alert">
          <p>{error}</p>
          <Button
            variant="outline"
            className="mt-2 min-h-11"
            onClick={() =>
              void generate(retryRequest?.length ?? summaryLength, retryRequest?.force ?? false)
            }
          >
            Try Again
          </Button>
        </div>
      )}
      {loading && (
        <div role="status" aria-label="Generating summary" className="space-y-3 py-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      )}
      <TabsContent value="ai" className="mt-0">
        {!loading &&
          (aiSummary ? (
            <StructuredSummaryMarkdown content={aiSummary} />
          ) : (
            <div>
              <p className="distil-reader">
                A shorter way into this story. Generate a summary to find the key ideas.
              </p>
              {generateButton}
            </div>
          ))}
      </TabsContent>
      <TabsContent value="original" className="mt-0">
        {original}
        {generateButton}
      </TabsContent>
    </Tabs>
  );
}
