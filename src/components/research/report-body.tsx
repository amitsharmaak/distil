"use client";

import { useMemo, type ComponentPropsWithoutRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Components, ExtraProps } from "react-markdown";
import { ExternalLink } from "lucide-react";
import {
  CITATION_LINK_TITLE,
  CITATION_REF_TITLE,
  markerRunIds,
  sourceAnchorId,
  type ReportHeading,
} from "./report-markdown";
import { domainOf, type ResearchSource } from "./research-sources";

const Markdown = dynamic(() => import("@/components/markdown").then((module) => module.Markdown));

type HeadingProps = ComponentPropsWithoutRef<"h2"> & ExtraProps;
type LinkProps = ComponentPropsWithoutRef<"a"> & ExtraProps;

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/**
 * Heading renderer that gives `##`/`###` headings the ids the table of contents links to. The id
 * is looked up by the heading's source line (react-markdown passes the hast node with its
 * position), so it always matches `extractHeadings` for the same markdown, duplicates included.
 */
export function createHeading(level: 2 | 3 | 4, idsByLine: Map<number, string>) {
  const Tag = `h${level}` as const;
  function ReportHeadingElement({ node, children, ...rest }: HeadingProps) {
    const line = node?.position?.start.line;
    // Only headings the table of contents knows get an id, so ids never collide (the TL;DR block
    // renders with an empty map and therefore adds none).
    const id = line !== undefined ? idsByLine.get(line) : undefined;
    return (
      <Tag {...rest} id={id} className="scroll-mt-20">
        {children}
      </Tag>
    );
  }
  ReportHeadingElement.displayName = `ReportH${level}`;
  return ReportHeadingElement;
}

/**
 * Link renderer. Citation links (marked by `compactCitationLinks`) and bare autolinks become a
 * small muted domain chip with an external-link icon; other links keep their text. Every external
 * link opens in a new tab without an opener.
 */
export function ReportLink({ node: _node, href, title, children, ...rest }: LinkProps) {
  void _node;
  const url = typeof href === "string" ? href : "";
  const isExternal = /^https?:\/\//i.test(url);
  const text = textOf(children).trim();
  const isChip = isExternal && (title === CITATION_LINK_TITLE || text === url);

  if (isChip) {
    const domain = domainOf(url);
    const label = text && text !== url ? text : domain;
    return (
      <a
        {...rest}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={label === domain ? url : `${label} — ${url}`}
        aria-label={`${label} (${domain}), opens in a new tab`}
        data-citation-chip=""
        className="mx-0.5 inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-border bg-muted/60 px-1.5 py-px align-middle font-sans text-xs leading-4 font-medium text-muted-foreground! no-underline! transition-colors hover:border-foreground/25 hover:text-foreground!"
      >
        <span className="truncate">{domain}</span>
        <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      </a>
    );
  }

  if (!isExternal) {
    return (
      <a {...rest} href={url || undefined} title={title}>
        {children}
      </a>
    );
  }

  return (
    <a {...rest} href={url} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function ReportTable({
  node: _node,
  children,
  ...rest
}: ComponentPropsWithoutRef<"table"> & ExtraProps) {
  void _node;
  return (
    <div
      className="my-6 w-full overflow-x-auto rounded-lg border border-border"
      data-table-scroll=""
    >
      <table {...rest} className="w-full border-collapse font-sans text-sm leading-snug">
        {children}
      </table>
    </div>
  );
}

function ReportTh({ node: _node, children, ...rest }: ComponentPropsWithoutRef<"th"> & ExtraProps) {
  void _node;
  return (
    <th
      {...rest}
      className="border-b border-border bg-muted/50 px-3 py-2 text-left align-bottom font-semibold"
    >
      {children}
    </th>
  );
}

function ReportTd({ node: _node, children, ...rest }: ComponentPropsWithoutRef<"td"> & ExtraProps) {
  void _node;
  return (
    <td {...rest} className="border-b border-border/60 px-3 py-2 align-top">
      {children}
    </td>
  );
}

function sourceLabel(source: ResearchSource): string {
  return source.title && source.title !== source.domain
    ? `${source.title} — ${source.domain}`
    : source.domain;
}

/**
 * Opens the collapsed sources disclosure(s) around a source entry before the browser follows the
 * `#source-n` fragment, so the jump lands on a visible row.
 */
function revealSource(id: number): void {
  const target = document.getElementById(sourceAnchorId(id));
  let element = target?.parentElement ?? null;
  while (element) {
    if (element instanceof HTMLDetailsElement) element.open = true;
    element = element.parentElement;
  }
}

/**
 * Link renderer for reports with numbered sources. Links marked by `linkCitationMarkers` become
 * one superscript group of citation numbers, each linking to its `#source-n` entry with the
 * source's title and domain as tooltip and accessible name; every other link is a `ReportLink`.
 */
export function createCitationLink(sourcesById: Map<number, ResearchSource>) {
  function CitationLink(props: LinkProps) {
    if (props.title !== CITATION_REF_TITLE) return <ReportLink {...props} />;
    const ids = markerRunIds(textOf(props.children)).filter((id) => sourcesById.has(id));
    if (ids.length === 0) return <>{`[${textOf(props.children).split(",").join("][")}]`}</>;
    return (
      <sup className="ml-0.5 font-sans text-xs leading-none" data-citation-group="">
        {ids.map((id, index) => {
          const source = sourcesById.get(id)!;
          const label = sourceLabel(source);
          return (
            <span key={id}>
              {index > 0 && (
                <span className="text-muted-foreground" aria-hidden="true">
                  ,
                </span>
              )}
              <a
                href={`#${sourceAnchorId(id)}`}
                title={label}
                aria-label={`Source ${id}: ${label}`}
                onClick={() => revealSource(id)}
                data-citation=""
                className="px-px font-medium text-primary! no-underline! tabular-nums hover:underline!"
              >
                {id}
              </a>
            </span>
          );
        })}
      </sup>
    );
  }
  CitationLink.displayName = "CitationLink";
  return CitationLink;
}

/**
 * Markdown element overrides for a report: heading ids, compact links, scrollable tables. With
 * `sources` (numbered R2 sources), citation marker links render as superscript citations.
 */
export function createReportComponents(
  headings: ReportHeading[],
  sources?: ResearchSource[]
): Components {
  const idsByLine = new Map(headings.map((heading) => [heading.line, heading.id]));
  return {
    h2: createHeading(2, idsByLine),
    h3: createHeading(3, idsByLine),
    h4: createHeading(4, idsByLine),
    a: sources ? createCitationLink(new Map(sources.map((s) => [s.id, s]))) : ReportLink,
    table: ReportTable,
    th: ReportTh,
    td: ReportTd,
  };
}

/**
 * Report markdown in the item reader's typography (`.distil-reader`). `headings` must come from
 * `extractHeadings(markdown)` for the same string so ids line up.
 */
export function ReportBody({
  markdown,
  headings,
  sources,
  className,
}: {
  markdown: string;
  headings: ReportHeading[];
  /** Numbered (R2) sources the `[n]` citation links resolve to; omit for legacy reports. */
  sources?: ResearchSource[];
  className?: string;
}) {
  const components = useMemo(() => createReportComponents(headings, sources), [headings, sources]);
  return (
    <div
      className={`distil-reader max-w-none break-words [&>:first-child]:mt-0! ${className ?? ""}`}
      data-testid="report-body"
    >
      <Markdown components={components}>{markdown}</Markdown>
    </div>
  );
}
