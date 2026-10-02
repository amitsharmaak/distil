"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { sourceAnchorId } from "./report-markdown";
import { shortPath, type ResearchSource } from "./research-sources";

/** Shown when none of a report's numbered sources came from web search. */
export const UNVERIFIED_SOURCES_NOTE = "Sources recalled by the model, not verified by search";

function SourceRow({
  source,
  numbered,
  anchored = false,
}: {
  source: ResearchSource;
  numbered: boolean;
  /** Give the row the `source-n` id that citation superscripts link to. */
  anchored?: boolean;
}) {
  const path = shortPath(source.url);
  return (
    <li
      id={anchored ? sourceAnchorId(source.id) : undefined}
      className={`flex min-w-0 gap-2 ${anchored ? "scroll-mt-20 rounded-md target:bg-primary/10" : ""}`}
    >
      {numbered && (
        <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {source.id}.
        </span>
      )}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.url}
        className="group flex min-w-0 flex-1 items-start gap-1.5 rounded-md py-0.5 text-sm hover:text-foreground"
      >
        <ExternalLink
          className="mt-1 h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          {source.title ? (
            <>
              <span className="block truncate font-medium text-foreground group-hover:underline">
                {source.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {source.domain}
                {path && <span className="opacity-70">{path}</span>}
              </span>
            </>
          ) : (
            <span className="block truncate">
              <span className="font-medium text-foreground group-hover:underline">
                {source.domain}
              </span>
              {path && <span className="text-muted-foreground">{path}</span>}
            </span>
          )}
        </span>
      </a>
    </li>
  );
}

const disclosureSummary =
  "flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden";
const chevron = "h-4 w-4 shrink-0 text-muted-foreground transition-transform";

/**
 * R2's numbered sources: cited-only, ordered by id, each row carrying the `source-n` anchor the
 * `[n]` superscripts link to. Collapsed by default (a citation click opens it). A one-line note
 * says so when none of the sources came from web search.
 */
function NumberedSourcesList({ sources }: { sources: ResearchSource[] }) {
  if (sources.length === 0) return null;
  const ordered = [...sources].sort((a, b) => a.id - b.id);
  const unverified = !sources.some((source) => source.grounded);
  return (
    <section aria-label="Sources" className="border-t border-border pt-4">
      <details className="group/sources">
        <summary className={`${disclosureSummary} py-1 text-sm font-semibold`}>
          <ChevronRight className={`${chevron} group-open/sources:rotate-90`} aria-hidden="true" />
          Sources ({sources.length})
        </summary>
        <ol className="mt-3 space-y-1.5 pl-1">
          {ordered.map((source) => (
            <SourceRow key={source.id} source={source} numbered anchored />
          ))}
        </ol>
      </details>
      {unverified && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="unverified-sources-note">
          {UNVERIFIED_SOURCES_NOTE}
        </p>
      )}
    </section>
  );
}

/**
 * Collapsed sources section. For a legacy URL list, cited sources come first and everything else
 * the research touched sits behind a second disclosure. With `numbered` (R2 source objects, all
 * cited), it is one numbered list anchored for the `[n]` citations; `other` is ignored.
 */
export function ResearchSourcesList({
  cited,
  other,
  numbered: numberedSources = false,
}: {
  cited: ResearchSource[];
  other: ResearchSource[];
  numbered?: boolean;
}) {
  if (numberedSources) return <NumberedSourcesList sources={cited} />;
  const total = cited.length + other.length;
  if (total === 0) return null;
  // Numbered source objects carry titles; show their numbers so `[n]` markers can be matched.
  const numbered = cited.some((source) => source.title !== null);

  return (
    <section aria-label="Sources" className="border-t border-border pt-4">
      <details className="group/sources">
        <summary className={`${disclosureSummary} py-1 text-sm font-semibold`}>
          <ChevronRight className={`${chevron} group-open/sources:rotate-90`} aria-hidden="true" />
          Sources
          <span className="font-normal text-muted-foreground">
            · {cited.length > 0 ? `${cited.length} cited` : `${total}`}
            {cited.length > 0 && other.length > 0 ? `, ${other.length} more` : ""}
          </span>
        </summary>

        <div className="mt-3 space-y-5 pl-1">
          {cited.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Cited in this report ({cited.length})
              </h3>
              <ol className="space-y-1.5">
                {cited.map((source) => (
                  <SourceRow key={source.url} source={source} numbered={numbered} />
                ))}
              </ol>
            </div>
          )}

          {other.length > 0 &&
            (cited.length > 0 ? (
              <details className="group/other">
                <summary className={`${disclosureSummary} text-sm text-muted-foreground`}>
                  <ChevronRight
                    className={`${chevron} group-open/other:rotate-90`}
                    aria-hidden="true"
                  />
                  Other links the research touched ({other.length})
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {other.map((source) => (
                    <SourceRow key={source.url} source={source} numbered={false} />
                  ))}
                </ul>
              </details>
            ) : (
              <div>
                <h3 className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  Links the research touched ({other.length})
                </h3>
                <ul className="space-y-1.5">
                  {other.map((source) => (
                    <SourceRow key={source.url} source={source} numbered={false} />
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </details>
    </section>
  );
}
