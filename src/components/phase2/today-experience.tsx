"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { FeedFilterSheet } from "@/components/feed/feed-filters";
import { FilterBar } from "@/components/feed/filter-bar";
import { Button } from "@/components/ui/button";
import { CACHE_FRESHNESS, useContentQuery } from "@/lib/client-cache/content-cache";
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
type PendingTodayNavigation = { url: string; key: string; previousView: TodayView | null };

function searchParamsForUrl(url: string): URLSearchParams {
  const queryStart = url.indexOf("?");
  return new URLSearchParams(queryStart === -1 ? "" : url.slice(queryStart + 1));
}

function updatedLabel(updatedAt: number): string {
  if (!updatedAt) return "Not updated yet";
  return `Updated ${new Date(updatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
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
 * the filter bar and sheet update native history. Next synchronizes
 * `useSearchParams`, while the account cache supplies or refreshes that view
 * without another server-component request.
 *
 * With `initial` for the current URL this is purely presentational. Without
 * it (no server-side user, the legacy SQLite path, or
 * `FEATURE_SERVER_RENDER=false`) it fetches the same read from the API.
 */
export function TodayExperience({
  initial,
  initialDataUpdatedAt,
}: { initial?: TodayInitial | null; initialDataUpdatedAt?: number } = {}) {
  const searchParams = useSearchParams();
  const urlFilters = todayFilterState(searchParams);
  const urlViewKey = todayViewKey(urlFilters);
  const [pendingNavigation, setPendingNavigation] = useState<PendingTodayNavigation | null>(null);
  const pendingUrl =
    pendingNavigation && pendingNavigation.key !== urlViewKey ? pendingNavigation.url : null;
  const effectiveSearchParams = pendingUrl ? searchParamsForUrl(pendingUrl) : searchParams;
  const filters = pendingUrl ? todayFilterState(effectiveSearchParams) : urlFilters;
  const filtered = isTodayFiltered(filters);
  const viewKey = todayViewKey(filters);
  const serverView = initial && initial.key === viewKey ? initial : null;
  const requestQuery = filtered
    ? todayResultsSearch(filters)
    : new URLSearchParams(TODAY_FEED_QUERY);
  const todayQuery = useContentQuery<TodayView>({
    key: ["today", viewKey],
    url: `/api/v1/feed?${requestQuery.toString()}`,
    staleTime: CACHE_FRESHNESS.feed,
    initialData: serverView ?? undefined,
    initialDataUpdatedAt: serverView ? initialDataUpdatedAt : undefined,
    transform: (raw) => todayView(filters, (raw ?? {}) as FeedResponse),
  });
  const previousView = pendingNavigation?.key === viewKey ? pendingNavigation.previousView : null;
  const view = todayQuery.data ?? previousView ?? serverView;
  const error = todayQuery.error instanceof Error ? todayQuery.error.message : null;
  const [searchDraft, setSearchDraft] = useState(filters.searchQuery);

  const replaceFilters = (updates: FilterUpdates) => {
    const current = pendingUrl
      ? searchParamsForUrl(pendingUrl)
      : new URLSearchParams(searchParams.toString());
    const nextUrl = filtersUrl("/", current, updates);
    const nextKey = todayViewKey(todayFilterState(searchParamsForUrl(nextUrl)));
    setPendingNavigation({ url: nextUrl, key: nextKey, previousView: view });
    window.history.replaceState(null, "", nextUrl);
  };

  const filterBar = (
    <>
      <FilterBar
        filters={filters}
        onChange={replaceFilters}
        onSearchDraftChange={setSearchDraft}
        placeholder="Search unread"
        leading={
          <div className="flex items-end gap-3">
            <TodayHeading />
            <span className="pb-1 text-xs text-muted-foreground">
              {updatedLabel(todayQuery.dataUpdatedAt)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5 h-8 gap-1.5"
              onClick={() => void todayQuery.refetch()}
              disabled={todayQuery.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${todayQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
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
      {error && view && (
        <p className="text-sm text-destructive" role="alert">
          Could not refresh Today. Showing the last loaded view.
        </p>
      )}
    </>
  );

  if (error && !view) {
    return (
      <TodayPrototype priority={[]} revisiting={[]} header={filterBar}>
        <div className="rounded-xl border border-destructive/40 p-5 text-sm" role="alert">
          <p className="font-medium">Today is unavailable</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      </TodayPrototype>
    );
  }
  if (!view) {
    return (
      <TodayPrototype priority={[]} revisiting={[]} header={filterBar}>
        <div className="py-12 text-center text-muted-foreground" role="status">
          Loading Today…
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
      searchEverythingHref: todaySearchEverythingHref(
        withQuery(effectiveSearchParams, searchDraft.trim())
      ),
    };
  } else if (view.mode === "results") {
    const withFilters = activeFilterChips(filters).length > 0 ? " with these filters" : "";
    results = {
      items: view.results,
      hasMore: view.hasMore,
      emptyMessage: filters.searchQuery
        ? `Nothing unread matches “${filters.searchQuery}”${withFilters}.`
        : "No unread items match these filters.",
      searchEverythingHref: todaySearchEverythingHref(effectiveSearchParams),
    };
  }

  return (
    <TodayPrototype
      priority={view.mode === "sections" ? view.sections.priority : []}
      revisiting={view.mode === "sections" ? view.sections.revisiting : []}
      header={filterBar}
      results={results}
      busy={(todayQuery.isFetching && !todayQuery.data) || stale}
    />
  );
}

function withQuery(current: URLSearchParams, q: string): URLSearchParams {
  const params = new URLSearchParams(current);
  params.set("q", q);
  return params;
}
