"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useReaderExperience } from "@/components/feed/reader-experience";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import { useContentCache } from "@/lib/client-cache/content-cache";
import { contentMutationRequest } from "@/lib/client-cache/mutation-request";
import type { ShortcutDef } from "@/lib/shortcuts/types";

const TOGGLE_VIEW: ShortcutDef = {
  id: "reader.toggleSummary",
  keys: [{ key: "s" }],
  label: "Toggle AI summary / original",
  group: "Reading",
  scope: "reader",
};
const TOGGLE_DEEPER: ShortcutDef = {
  id: "reader.goDeeper",
  keys: [{ key: "d" }],
  label: "Go deeper / show less",
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

interface DetailedSplit {
  /** The brief as the detailed summary repeats it. */
  brief: SummarySectionBlock[];
  /** The "Going deeper" divider and the delta sections; null for a pre-v2 standalone detailed summary. */
  delta: SummarySectionBlock[] | null;
}

/** Split a stored detailed summary at its "Going deeper" divider. */
function splitDetailedSummary(content: string): DetailedSplit {
  const sections = parseSummarySections(content);
  const divider = sections.findIndex((section) => section.key === GOING_DEEPER_KEY);
  if (divider < 0) return { brief: sections, delta: null };
  return { brief: sections.slice(0, divider), delta: sections.slice(divider) };
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
function SummarySections({ sections }: { sections: SummarySectionBlock[] }) {
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
  const router = useRouter();
  const cache = useContentCache();
  const [briefSummary, setBriefSummary] = useState<string | null>(initialBriefSummary ?? null);
  const [detailedSummary, setDetailedSummary] = useState<string | null>(
    initialDetailedSummary ?? null
  );
  const hasInitialSummary = !!(initialBriefSummary || initialDetailedSummary);
  // An item that only has a detailed summary opens fully expanded; "Show less" folds it.
  const [expanded, setExpanded] = useState(!initialBriefSummary && !!initialDetailedSummary);
  const [loading, setLoading] = useState<SummaryLength | null>(null);
  const [retryRequest, setRetryRequest] = useState<{
    length: SummaryLength;
    force: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(hasInitialSummary ? "ai" : "original");

  const generate = useCallback(
    async (length: SummaryLength, force = false): Promise<{ ok: boolean; cached: boolean }> => {
      setLoading(length);
      setRetryRequest({ length, force });
      setError(null);
      try {
        const res = await contentMutationRequest("/api/ai/summarize", {
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
          setExpanded(true);
        }
        setViewMode("ai");
        // Cards show the summary too, and it is part of the server-rendered reader props.
        void Promise.allSettled([cache.invalidate(["feed"]), cache.invalidate(["today"])]);
        router.refresh();
        return { ok: true, cached: !!data.cached };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        return { ok: false, cached: false };
      } finally {
        setLoading(null);
      }
    },
    [cache, itemId, router]
  );

  /**
   * Regenerate the brief. When the delta is open it is rebuilt afterwards, because the delta
   * expands one particular brief and a new brief makes it stale; a brief the server kept
   * (regenerated moments ago) keeps its delta too.
   */
  const regenerate = useCallback(async () => {
    const result = await generate("brief", true);
    if (result.ok && !result.cached && expanded) await generate("detailed");
  }, [expanded, generate]);

  const detailedSplit = useMemo(
    () => (detailedSummary ? splitDetailedSummary(detailedSummary) : null),
    [detailedSummary]
  );
  const briefSections = useMemo(
    () => (briefSummary ? parseSummarySections(briefSummary) : (detailedSplit?.brief ?? [])),
    [briefSummary, detailedSplit]
  );
  const deltaSections = detailedSplit?.delta ?? null;
  // A pre-v2 detailed summary has no divider and stands in for the brief when it is all there is.
  const canDeepen = !!briefSummary || deltaSections !== null;
  const sections =
    expanded && detailedSplit
      ? deltaSections
        ? [...briefSections, ...deltaSections]
        : detailedSplit.brief
      : briefSections;

  async function toggleDeeper() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (detailedSummary) {
      setExpanded(true);
      return;
    }
    await generate("detailed");
  }

  const hasAISummary = !!briefSummary || !!detailedSummary;
  const reader = useReaderExperience();
  const setSummaryAction = reader?.setSummaryAction;
  useEffect(() => {
    setSummaryAction?.(
      hasAISummary ? { regenerate: () => void regenerate(), disabled: loading !== null } : null
    );
    return () => setSummaryAction?.(null);
  }, [setSummaryAction, hasAISummary, regenerate, loading]);

  useShortcut(
    TOGGLE_VIEW,
    () => setViewMode((mode) => (mode === "ai" ? "original" : "ai")),
    hasAISummary
  );
  useShortcut(
    TOGGLE_DEEPER,
    () => void toggleDeeper(),
    hasAISummary && canDeepen && viewMode === "ai" && loading === null
  );
  useShortcut(
    REGENERATE,
    () => void regenerate(),
    hasAISummary && viewMode === "ai" && loading === null
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
      disabled={loading !== null}
      onClick={() => void generate("brief")}
    >
      <Sparkles className="h-4 w-4" /> Generate AI Summary
    </Button>
  );
  const deeperButton = canDeepen && (
    <Button
      variant="outline"
      className="mt-5 min-h-11 gap-2"
      disabled={loading !== null}
      aria-expanded={expanded}
      aria-keyshortcuts="d"
      title={expanded ? "Show less · D" : "Go deeper · D"}
      onClick={() => void toggleDeeper()}
    >
      {expanded ? <ChevronUp className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      {expanded ? "Show less" : "Go deeper"}
    </Button>
  );
  const errorBlock = error && (
    <div className="mb-4 text-sm text-danger" role="alert">
      <p>{error}</p>
      <Button
        variant="outline"
        className="mt-2 min-h-11"
        onClick={() => void generate(retryRequest?.length ?? "brief", retryRequest?.force ?? false)}
      >
        Try Again
      </Button>
    </div>
  );
  const skeleton = (
    <div role="status" aria-label="Generating summary" className="space-y-3 py-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
  // A failed or running delta request reports below the brief, where "Go deeper" sits.
  const deltaRequest = retryRequest?.length === "detailed" && hasAISummary;
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
      </div>
      {!deltaRequest && errorBlock}
      {loading === "brief" && skeleton}
      <TabsContent value="ai" className="mt-0">
        {loading !== "brief" &&
          (hasAISummary ? (
            <div>
              <SummarySections sections={sections} />
              {loading === "detailed" && skeleton}
              {deltaRequest && errorBlock}
              {deeperButton}
            </div>
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
