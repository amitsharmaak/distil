"use client";

import { startTransition, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FeedFilterSheet } from "@/components/feed/feed-filters";
import { FilterBar } from "@/components/feed/filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedItem } from "@/lib/feed/feed-query";
import { normalizeSearchQuery } from "@/lib/feed/feed-url";
import { activeFilterChips, filtersUrl, type FilterUpdates } from "@/lib/feed/quick-filters";
import {
  TODAY_FEED_QUERY,
  isTodayFiltered,
  todayFilterState,
  todayResultsSearch,
  todaySearchEverythingHref,
  todayView,
  todayViewKey,
  type TodayView,
} from "@/lib/feed/today-selection";
import type { KnowledgeItem } from "./types";
import { TodayHeading, TodayPrototype, type TodayResultsProps } from "./today-prototype";

type FeedResponse = {
  items?: FeedItem[];
  resurfacedItems?: FeedItem[];
  nextCursor?: string;
  error?: { message?: string };
};

/** What the server page hands over for its URL. */
export type TodayInitial = TodayView;

async function getFeed(query: URLSearchParams): Promise<FeedResponse> {
  const response = await fetch(`/api/v1/feed?${query.toString()}`);
  const payload = (await response.json().catch(() => ({}))) as FeedResponse;
  if (!response.ok) throw new Error(payload.error?.message || "Unable to load your reading queue.");
  return payload;
}

/** Case-insensitive match on what a card shows, for the instant local narrowing. */
function matchesDraft(item: KnowledgeItem, needle: string): boolean {
  return [item.title, item.source].some((value) => value?.toLowerCase().includes(needle));
}

function viewItems(view: TodayView): KnowledgeItem[] {
  if (view.mode === "results") return view.results;
  const seen = new Set<string>();
  return [...view.sections.priority, ...view.sections.revisiting].filter((item) =>
    seen.has(item.id) ? false : (seen.add(item.id), true)
  );
}

/**
 * Today. With no search and no filter in the URL it shows the fixed
 * selection (priority reading and the resurfacing strip). A search, an area
 * or any other filter replaces both sections with one list of unread matches
 * and a "Search everything →" link to the Feed. The URL is the only state:
 * the filter bar and sheet navigate with `router.replace`, and the server
 * page renders the view for the new URL.
 *
 * With `initial` for the current URL this is purely presentational. Without
 * it (no server-side user, the legacy SQLite path, or
 * `FEATURE_SERVER_RENDER=false`) it fetches the same read from the API.
 */
export function TodayExperience({ initial }: { initial?: TodayInitial | null } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = todayFilterState(searchParams);
  const filtered = isTodayFiltered(filters);
  const viewKey = todayViewKey(filters);
  const serverView = initial && initial.key === viewKey ? initial : null;

  const [view, setView] = useState<TodayView | null>(serverView);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(filters.searchQuery);
  const [isPending, startNavigation] = useTransition();

  // A new server view (after router.replace) replaces what is shown in one step.
  useEffect(() => {
    if (!serverView) return;
    startTransition(() => {
      setView(serverView);
      setError(null);
    });
  }, [serverView]);

  // Client fetch only when the server did not render this exact view.
  const needsFetch = !serverView && view?.key !== viewKey;
  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    const state = todayFilterState(searchParams);
    const query = isTodayFiltered(state)
      ? todayResultsSearch(state)
      : new URLSearchParams(TODAY_FEED_QUERY);
    getFeed(query)
      .then((payload) => {
        if (cancelled) return;
        setView(todayView(state, payload));
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Today.");
      });
    return () => {
      cancelled = true;
    };
    // `searchParams` is read through `viewKey`, its stable identity for Today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFetch, viewKey]);

  const replaceFilters = (updates: FilterUpdates) => {
    startNavigation(() => {
      router.replace(filtersUrl("/", searchParams, updates), { scroll: false });
    });
  };

  const filterBar = (
    <FilterBar
      filters={filters}
      onChange={replaceFilters}
      onSearchDraftChange={setSearchDraft}
      placeholder="Search unread"
      leading={<TodayHeading items={view ? viewItems(view) : []} />}
      sheet={
        <FeedFilterSheet
          filters={filters}
          onChange={replaceFilters}
          activeCount={activeFilterChips(filters).length}
          topicOptions={view?.topics ?? []}
          unreadQueue
          showSort={filtered}
        />
      }
    />
  );

  if (error) {
    return (
      <TodayPrototype priority={[]} revisiting={[]} header={filterBar}>
        <div className="rounded-xl border border-danger/40 p-5 text-sm" role="alert">
          <p className="font-medium">Today is unavailable</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      </TodayPrototype>
    );
  }
  if (!view) {
    return (
      <TodayPrototype priority={[]} revisiting={[]} header={filterBar}>
        <div role="status" aria-label="Loading Today" className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="space-y-3 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </TodayPrototype>
    );
  }

  // Until the typed text reaches the URL, narrow what is already on screen.
  const draftNeedle = searchDraft.trim().toLowerCase();
  const narrowing =
    Boolean(draftNeedle) && normalizeSearchQuery(searchDraft) !== filters.searchQuery;
  const stale = view.key !== viewKey;

  let results: TodayResultsProps | undefined;
  if (narrowing) {
    results = {
      items: viewItems(view).filter((item) => matchesDraft(item, draftNeedle)),
      hasMore: false,
      emptyMessage: `Nothing on screen matches “${searchDraft.trim()}”.`,
      searchEverythingHref: todaySearchEverythingHref(withQuery(searchParams, searchDraft.trim())),
    };
  } else if (view.mode === "results") {
    const withFilters = activeFilterChips(filters).length > 0 ? " with these filters" : "";
    results = {
      items: view.results,
      hasMore: view.hasMore,
      emptyMessage: filters.searchQuery
        ? `Nothing unread matches “${filters.searchQuery}”${withFilters}.`
        : "No unread items match these filters.",
      searchEverythingHref: todaySearchEverythingHref(searchParams),
    };
  }

  return (
    <TodayPrototype
      priority={view.mode === "sections" ? view.sections.priority : []}
      revisiting={view.mode === "sections" ? view.sections.revisiting : []}
      header={filterBar}
      results={results}
      busy={isPending || stale}
    />
  );
}

function withQuery(current: URLSearchParams, q: string): URLSearchParams {
  const params = new URLSearchParams(current);
  params.set("q", q);
  return params;
}
