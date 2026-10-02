"use client";

import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { useMemo } from "react";
import { ReportBody } from "./report-body";
import { linkCitationMarkers, prepareReport, SUMMARY_ANCHOR_ID } from "./report-markdown";
import { ReportToc } from "./report-toc";
import { ReportToolbar } from "./report-toolbar";
import { hasNumberedSources, normalizeSources, splitSources } from "./research-sources";
import { ResearchSourcesList } from "./research-sources-list";

export interface CompletedResearchReport {
  query: string;
  report: string;
  /** Legacy `string[]`, R2 source objects, or anything else the API returned. */
  sources: unknown;
  itemId?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * The completed report: a single reading column in the item reader's typography with the question,
 * reading stats and actions on top, a TL;DR, the cleaned body, and collapsed sources. The table of contents stays in an "On this page" disclosure at every width.
 */
export function ResearchReportView({ report }: { report: CompletedResearchReport }) {
  const numbered = useMemo(() => hasNumberedSources(report.sources), [report.sources]);
  const { cited, other } = useMemo(() => {
    const sources = normalizeSources(report.sources);
    // R2 sources are cited-only and numbered to match the `[n]` markers; no split needed.
    return numbered ? { cited: sources, other: [] } : splitSources(sources, report.report);
  }, [numbered, report.sources, report.report]);
  const prepared = useMemo(() => {
    const base = prepareReport(report.report);
    if (!numbered) return base;
    const ids = cited.map((source) => source.id);
    return {
      ...base,
      summary: base.summary === null ? null : linkCitationMarkers(base.summary, ids),
      body: linkCitationMarkers(base.body, ids),
    };
  }, [report.report, numbered, cited]);
  const citationSources = numbered ? cited : undefined;

  const sourceCount = cited.length > 0 ? cited.length : other.length;
  const date = formatDate(report.completedAt ?? report.createdAt);
  const stats = [
    prepared.sectionCount > 0 ? plural(prepared.sectionCount, "section") : null,
    `~${prepared.readingMinutes} min read`,
    sourceCount > 0 ? plural(sourceCount, "source") : null,
  ].filter((part): part is string => part !== null);

  return (
    <div>
      <article className="mx-auto w-full max-w-none min-w-0 space-y-6">
        <PageHeader
          title={report.query}
          eyebrow="Deep research"
          meta={
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
              {date && (
                <>
                  <time dateTime={report.completedAt ?? report.createdAt}>
                    {report.completedAt ? `Completed ${date}` : date}
                  </time>
                  <span aria-hidden="true" className="text-border">
                    ·
                  </span>
                </>
              )}
              <span data-testid="report-stats">{stats.join(" · ")}</span>
            </p>
          }
        />
        <div className="-ml-2.5">
          <ReportToolbar markdown={report.report} query={report.query} itemId={report.itemId} />
        </div>

        <ReportToc
          headings={prepared.headings}
          hasSummary={prepared.summary !== null}
          variant="collapsible"
        />

        {prepared.summary && (
          <section
            id={SUMMARY_ANCHOR_ID}
            aria-label="TL;DR"
            className="scroll-mt-20 rounded-xl border-l-2 border-border bg-muted/30 px-4 py-4 sm:px-5"
          >
            <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              TL;DR
            </p>
            <ReportBody markdown={prepared.summary} headings={[]} sources={citationSources} />
          </section>
        )}

        <ReportBody
          markdown={prepared.body}
          headings={prepared.headings}
          sources={citationSources}
        />

        <ResearchSourcesList cited={cited} other={other} numbered={numbered} />
      </article>
    </div>
  );
}
