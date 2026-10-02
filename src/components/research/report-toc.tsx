"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SUMMARY_ANCHOR_ID, type ReportHeading } from "./report-markdown";

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function tocEntries(headings: ReportHeading[], hasSummary: boolean): TocEntry[] {
  const entries: TocEntry[] = headings.map(({ id, text, level }) => ({ id, text, level }));
  return hasSummary ? [{ id: SUMMARY_ANCHOR_ID, text: "TL;DR", level: 2 }, ...entries] : entries;
}

/** Tracks which entry is currently being read, where IntersectionObserver is available. */
function useActiveId(idList: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = idList.join("|");
  useEffect(() => {
    const ids = key ? key.split("|") : [];
    if (typeof IntersectionObserver === "undefined" || ids.length === 0) return;
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (record.isIntersecting) visible.add(record.target.id);
          else visible.delete(record.target.id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-64px 0px -65% 0px" }
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function TocList({
  entries,
  activeId,
  onNavigate,
}: {
  entries: TocEntry[];
  activeId: string | null;
  onNavigate?: () => void;
}) {
  return (
    <ol className="space-y-1 text-sm">
      {entries.map((entry) => {
        const isActive = entry.id === activeId;
        return (
          <li key={entry.id} className={entry.level === 3 ? "pl-3" : undefined}>
            <a
              href={`#${entry.id}`}
              onClick={onNavigate}
              aria-current={isActive ? "location" : undefined}
              className={`-ml-px block border-l py-1 pl-3 leading-snug transition-colors ${
                isActive
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              } ${entry.level === 3 ? "text-xs" : ""}`}
            >
              {entry.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Table of contents for a report. `variant="rail"` is the sticky right rail shown on wide screens;
 * `variant="collapsible"` is the "On this page" disclosure shown above the body on phones. Nothing
 * renders when the report has fewer than two entries.
 */
export function ReportToc({
  headings,
  hasSummary,
  variant,
  className,
}: {
  headings: ReportHeading[];
  hasSummary: boolean;
  variant: "rail" | "collapsible";
  className?: string;
}) {
  const entries = tocEntries(headings, hasSummary);
  const activeId = useActiveId(variant === "rail" ? entries.map((entry) => entry.id) : []);
  const [open, setOpen] = useState(false);

  if (entries.length < 2) return null;

  if (variant === "rail") {
    return (
      <nav aria-label="On this page" className={className}>
        <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          On this page
        </p>
        <div className="border-l border-border">
          <TocList entries={entries} activeId={activeId} />
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="On this page" className={className}>
      <details
        open={open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="group rounded-lg border border-border"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>
            On this page
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {entries.length} {entries.length === 1 ? "part" : "parts"}
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-border px-1 py-2">
          <TocList entries={entries} activeId={null} onNavigate={() => setOpen(false)} />
        </div>
      </details>
    </nav>
  );
}
