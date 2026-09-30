"use client";

import { useMemo } from "react";
import { ReportBody } from "./report-body";
import { prepareReport, SUMMARY_ANCHOR_ID } from "./report-markdown";
import { ReportToc } from "./report-toc";
import { ReportToolbar } from "./report-toolbar";
import { normalizeSources, splitSources } from "./research-sources";
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

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The completed report: a single reading column in the item reader's typography with the question,
 * reading stats and actions on top, a TL;DR, the cleaned body, and collapsed sources. A table of
 * contents sits in a sticky right rail on wide screens and in an "On this page" disclosure on
 * phones.
 */
export function ResearchReportView({ report }: { report: CompletedResearchReport }) {
  const prepared = useMemo(() => prepareReport(report.report), [report.report]);
  const { cited, other } = useMemo(
    () => splitSources(normalizeSources(report.sources), report.report),
    [report.sources, report.report]
  );

  const sourceCount = cited.length > 0 ? cited.length : other.length;
  const date = formatDate(report.completedAt ?? report.createdAt);
  const stats = [
    prepared.sectionCount > 0 ? plural(prepared.sectionCount, "section") : null,
    `~${prepared.readingMinutes} min read`,
    sourceCount > 0 ? plural(sourceCount, "source") : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-12">
      <article className="mx-auto w-full max-w-2xl min-w-0 space-y-6">
        <header className="space-y-3">
          <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Deep research
          </p>
          <h1 className="font-serif text-display leading-tight font-semibold tracking-tight text-balance">
            {report.query}
          </h1>
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
          <div className="-ml-2.5">
            <ReportToolbar markdown={report.report} query={report.query} itemId={report.itemId} />
          </div>
        </header>

        <ReportToc
          headings={prepared.headings}
          hasSummary={prepared.summary !== null}
          variant="collapsible"
          className="lg:hidden"
        />

        {prepared.summary && (
          <section
            id={SUMMARY_ANCHOR_ID}
            aria-label="TL;DR"
            className="scroll-mt-20 rounded-xl border-l-2 border-primary bg-muted/50 px-4 py-4 sm:px-5"
          >
            <p className="mb-2 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              TL;DR
            </p>
            <ReportBody markdown={prepared.summary} headings={[]} />
          </section>
        )}

        <ReportBody markdown={prepared.body} headings={prepared.headings} />

        <ResearchSourcesList cited={cited} other={other} />
      </article>

      <aside className="hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pb-6">
          <ReportToc
            headings={prepared.headings}
            hasSummary={prepared.summary !== null}
            variant="rail"
          />
        </div>
      </aside>
    </div>
  );
}
