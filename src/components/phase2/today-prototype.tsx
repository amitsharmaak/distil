"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { StoryCard } from "@/components/feed/story-card";
import { useShortcutsSuspended } from "@/components/shortcuts/shortcuts-provider";
import { useRowNavigation } from "@/components/shortcuts/use-row-navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { readingMinutes } from "@/lib/display";
import type { KnowledgeItem } from "./types";

type TodayPrototypeProps = {
  priority: KnowledgeItem[];
  revisiting: KnowledgeItem[];
};

type AreaControls = {
  areaOpenId?: string | null;
  onAreaOpenChange?: (id: string, open: boolean) => void;
};

/** The edition masthead stays in the server-rendered first page. */
export function TodayHeading({ items = [] }: { items?: KnowledgeItem[] }) {
  const minutes = items.reduce((sum, item) => sum + readingMinutes(item), 0);
  return (
    <PageHeader
      title="Today"
      eyebrow={formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}
      meta={`${items.length} ${items.length === 1 ? "story" : "stories"} · ${minutes} min`}
      className="mb-0"
    />
  );
}

export interface TodayResultsProps {
  items: KnowledgeItem[];
  /** More unread matches exist than are shown. */
  hasMore: boolean;
  /** Shown when nothing matches. */
  emptyMessage: string;
  /** The same search on the Feed, across read items too. */
  searchEverythingHref: string;
}

/** Filtered Today: one list of unread matches in place of the edition. */
export function TodayResults({
  items,
  hasMore,
  emptyMessage,
  searchEverythingHref,
  areaOpenId,
  onAreaOpenChange,
}: TodayResultsProps & AreaControls) {
  return (
    <section aria-labelledby="today-results-heading">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <h2 id="today-results-heading" className="font-serif text-xl font-medium">
            Unread matches
          </h2>
          {items.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {hasMore ? `First ${items.length}` : items.length}
            </span>
          )}
        </div>
        <Link
          href={searchEverythingHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Search everything →
        </Link>
      </div>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <StoryCard
                item={item}
                areaOpen={areaOpenId === item.id}
                onAreaOpenChange={(open) => onAreaOpenChange?.(item.id, open)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div role="status">
          <EmptyState title={emptyMessage} className="py-8" />
        </div>
      )}
    </section>
  );
}

/** The same selection and URL-driven results, expressed as a daily edition. */
export function TodayPrototype({
  priority,
  revisiting,
  header,
  results,
  busy = false,
  children,
}: TodayPrototypeProps & {
  header?: React.ReactNode;
  results?: TodayResultsProps;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const [areaOpenId, setAreaOpenId] = useState<string | null>(null);
  useShortcutsSuspended(areaOpenId !== null);
  useRowNavigation(rowsRef, { onOpenArea: setAreaOpenId });
  const areaControls = {
    areaOpenId,
    onAreaOpenChange: (id: string, open: boolean) => setAreaOpenId(open ? id : null),
  };
  const editionItems = [
    ...new Map([...priority, ...revisiting].map((item) => [item.id, item])).values(),
  ];
  return (
    <PageContainer size="wide" className="space-y-3 sm:space-y-6">
      <div className="border-b border-foreground/30 pb-3 sm:pb-4">
        {header ?? <TodayHeading items={results?.items ?? editionItems} />}
      </div>
      <div
        ref={rowsRef}
        className={busy ? "space-y-8 opacity-60 transition-opacity" : "space-y-8"}
        aria-busy={busy}
      >
        {children ??
          (results ? (
            <TodayResults {...results} {...areaControls} />
          ) : (
            <TodayDefaultSections priority={priority} revisiting={revisiting} {...areaControls} />
          ))}
      </div>
      {!children && (
        <p className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
          You’ve reached the end of this edition.
        </p>
      )}
    </PageContainer>
  );
}

function TodayDefaultSections({
  priority,
  revisiting,
  areaOpenId,
  onAreaOpenChange,
}: TodayPrototypeProps & AreaControls) {
  const story = (item: KnowledgeItem, variant: "lead" | "standard" | "compact") => (
    <StoryCard
      item={item}
      variant={variant}
      areaOpen={areaOpenId === item.id}
      onAreaOpenChange={(open) => onAreaOpenChange?.(item.id, open)}
    />
  );
  return (
    <>
      <section aria-labelledby="priority-reading-heading">
        <h2 id="priority-reading-heading" className="sr-only">
          Priority Reading
        </h2>
        {priority.length ? (
          <>
            <ul className="lg:grid lg:grid-cols-2 lg:gap-x-8">
              <li className="lg:row-span-4 lg:border-r lg:border-border lg:pr-8">
                {story(priority[0], "lead")}
              </li>
              {priority.slice(1, 5).map((item) => (
                <li key={item.id}>{story(item, "standard")}</li>
              ))}
            </ul>
            {priority.length > 5 && (
              <ul>
                {priority.slice(5).map((item) => (
                  <li key={item.id}>{story(item, "compact")}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <EmptyState
            title="Nothing urgent is waiting for you."
            description="Your next edition will take shape as you save more stories."
          />
        )}
      </section>
      <section aria-labelledby="worth-revisiting-heading" className="border-t border-border pt-5">
        <h2 id="worth-revisiting-heading" className="mb-2 font-serif text-xl font-medium">
          Worth Revisiting
        </h2>
        {revisiting.length ? (
          <ul className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
            {revisiting.map((item) => (
              <li key={item.id}>
                {story(item, "compact")}
                {item.reason && !/^(?:Item priority|Why now):/i.test(item.reason) && (
                  <p className="mt-2 text-xs text-muted-foreground">{item.reason}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">
            Saved ideas will return here when the timing is useful.
          </p>
        )}
      </section>
    </>
  );
}
