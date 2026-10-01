"use client";

/**
 * Feed client island.
 *
 * The URL is the single source of truth for the filters and the search: the
 * server page parses it, renders the first page of items and seeds the shared
 * account cache. Same-page filter changes use the native history API (which
 * Next keeps in sync with `useSearchParams`) and read through that cache, so
 * they do not wait for another server-component response.
 *
 * While a search is being typed, the items already on screen are narrowed
 * locally at once; the debounced URL change then brings the server's answer.
 *
 * Without `initialPage` (the legacy SQLite path, or a request with no
 * server-side user) the island fetches the page itself.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { IntentLink as Link } from "@/components/navigation/intent-link";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { ContentCard } from "@/components/feed/content-card";
import { FeedFilterSheet } from "@/components/feed/feed-filters";
import { FilterBar } from "@/components/feed/filter-bar";
import { Button } from "@/components/ui/button";
import { useShortcut, useShortcutsSuspended } from "@/components/shortcuts/shortcuts-provider";
import { useRowNavigation } from "@/components/shortcuts/use-row-navigation";
import {
  CACHE_FRESHNESS,
  useContentCache,
  useContentQuery,
} from "@/lib/client-cache/content-cache";
import { useItemMutation } from "@/lib/client-cache/item-mutations";
import { useViewScroll } from "@/lib/client-cache/view-scroll";
import {
  type ProcessingItemStatus,
  useProcessingStatusPoll,
} from "@/lib/client-cache/processing-status-poll";
import {
  feedFilterKey,
  feedFilterState,
  feedRequestSearch,
  normalizeSearchQuery,
  type FeedFilterState,
} from "@/lib/feed/feed-url";
import { activeFilterChips, filtersUrl, type FilterUpdates } from "@/lib/feed/quick-filters";
import type { ShortcutDef } from "@/lib/shortcuts/types";
import type { ContentItemSummary } from "@/lib/types";

export interface FeedInitialPage {
  /** `feedFilterKey` of the URL the server rendered for; must match to be used. */
  key: string;
  items: ContentItemSummary[];
  nextCursor?: string;
}

type FeedResponse = {
  items?: ContentItemSummary[];
  nextCursor?: string;
  error?: { message?: string };
};

export interface FeedCacheData {
  items: ContentItemSummary[];
  nextCursor?: string;
  /** Ids belonging to the refreshable first page; later pages stay cached. */
  firstPageIds: string[];
  loadedMore: boolean;
}

type PendingFeedNavigation = {
  url: string;
  key: string;
  originKey: string;
  acknowledged: boolean;
  previousPage: FeedCacheData | null;
};

function requestPath(state: FeedFilterState, cursor?: string): string {
  return `/api/v1/feed?${feedRequestSearch(state, cursor).toString()}`;
}

function feedCacheData(raw: unknown): FeedCacheData {
  const response = (raw ?? {}) as FeedResponse;
  const items = response.items ?? [];
  return {
    items,
    nextCursor: response.nextCursor,
    firstPageIds: items.map((item) => item.id),
    loadedMore: false,
  };
}

function uniqueItems(items: ContentItemSummary[]): ContentItemSummary[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

function updatedLabel(updatedAt: number): string {
  if (!updatedAt) return "Not updated yet";
  return `Updated ${new Date(updatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function nextFeedUrl(current: URLSearchParams, updates: FilterUpdates): string {
  return filtersUrl("/feed", current, updates);
}

function searchParamsForFeedUrl(url: string): URLSearchParams {
  const queryStart = url.indexOf("?");
  return new URLSearchParams(queryStart === -1 ? "" : url.slice(queryStart + 1));
}

/** Case-insensitive match on what a card shows, for the instant local narrowing. */
function matchesDraft(item: ContentItemSummary, needle: string): boolean {
  return [item.title, item.publication, item.author].some((value) =>
    value?.toLowerCase().includes(needle)
  );
}

const listShortcut = { group: "Lists", scope: "list" } as const;
const FILTERS_SHORTCUT: ShortcutDef = {
  id: "list.filters",
  keys: [{ key: "f" }],
  label: "Open filters",
  ...listShortcut,
};
const UNREAD_SHORTCUT: ShortcutDef = {
  id: "list.toggleUnread",
  keys: [{ key: "u" }],
  label: "Show or hide read items",
  ...listShortcut,
};
const LAYOUT_SHORTCUT: ShortcutDef = {
  id: "list.toggleLayout",
  keys: [{ key: "c" }],
  label: "Toggle card / compact",
  ...listShortcut,
};

export function FeedList({
  initialPage,
  initialDataUpdatedAt,
}: {
  initialPage: FeedInitialPage | null;
  initialDataUpdatedAt?: number;
}) {
  const searchParams = useSearchParams();
  const urlFilters = feedFilterState(searchParams);
  const urlFilterKey = feedFilterKey(urlFilters);
  const [pendingNavigation, setPendingNavigation] = useState<PendingFeedNavigation | null>(null);
  const pendingUrl =
    pendingNavigation &&
    !pendingNavigation.acknowledged &&
    urlFilterKey === pendingNavigation.originKey &&
    pendingNavigation.key !== urlFilterKey
      ? pendingNavigation.url
      : null;
  const filters = pendingUrl ? feedFilterState(searchParamsForFeedUrl(pendingUrl)) : urlFilters;
  const filterKey = feedFilterKey(filters);
  const serverPage = initialPage && initialPage.key === filterKey ? initialPage : null;
  const cache = useContentCache();
  const { updateItem } = useItemMutation();
  const cacheKey = ["feed", filterKey] as const;
  const initialData = serverPage
    ? {
        items: serverPage.items,
        nextCursor: serverPage.nextCursor,
        firstPageIds: serverPage.items.map((item) => item.id),
        loadedMore: false,
      }
    : undefined;
  const feedQuery = useContentQuery<FeedCacheData>({
    key: cacheKey,
    url: requestPath(filters, filters.cursor),
    staleTime: CACHE_FRESHNESS.feed,
    initialData,
    initialDataUpdatedAt: serverPage ? initialDataUpdatedAt : undefined,
    transform: (raw) => {
      const incoming = feedCacheData(raw);
      const previous = cache.get<FeedCacheData>(cacheKey);
      if (!previous?.loadedMore) return incoming;
      const previousFirstPage = new Set(previous.firstPageIds);
      const retainedPages = previous.items.filter(
        (item) =>
          !previousFirstPage.has(item.id) &&
          (filters.showRead || !item.isRead) &&
          (filters.archive === "include" ||
            (filters.archive === "only" ? Boolean(item.archivedAt) : !item.archivedAt)) &&
          (!filters.areas.length || (item.area && filters.areas.includes(item.area)))
      );
      return {
        ...incoming,
        items: uniqueItems([...incoming.items, ...retainedPages]),
        nextCursor: previous.nextCursor,
        loadedMore: true,
      };
    },
  });
  const previousPage = pendingNavigation?.key === filterKey ? pendingNavigation.previousPage : null;
  const page = feedQuery.data ?? previousPage ?? initialData ?? null;
  const items = page?.items ?? [];
  const nextCursor = page?.nextCursor;
  const loadError = feedQuery.error instanceof Error ? feedQuery.error.message : null;
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "compact">("card");
  const [searchDraft, setSearchDraft] = useState(filters.searchQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [areaOpenId, setAreaOpenId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Once Next has observed our history update, later browser/external history
  // changes own the URL. Keep only the previous page as a query placeholder.
  useEffect(() => {
    if (
      !pendingNavigation ||
      pendingNavigation.acknowledged ||
      urlFilterKey !== pendingNavigation.key
    ) {
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPendingNavigation((current) =>
        current?.url === pendingNavigation.url ? { ...current, acknowledged: true } : current
      );
    });
    return () => {
      active = false;
    };
  }, [pendingNavigation, urlFilterKey]);

  const loading = !page && !loadError;
  useViewScroll(`feed:${filterKey}`, Boolean(feedQuery.data));

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const raw = await cache.fetch<FeedResponse>({
        key: [...cacheKey, "page", nextCursor],
        url: requestPath(filters, nextCursor),
        staleTime: CACHE_FRESHNESS.feed,
      });
      const nextPage = feedCacheData(raw);
      cache.set<FeedCacheData>(cacheKey, (current) => {
        const base = current ?? feedCacheData({ items: [] });
        return {
          items: uniqueItems([...base.items, ...nextPage.items]),
          nextCursor: nextPage.nextCursor,
          firstPageIds: base.firstPageIds,
          loadedMore: true,
        };
      });
    } catch (cause) {
      setLoadMoreError(cause instanceof Error ? cause.message : "Unable to load more items.");
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Poll every 3 seconds while any items are in processing state.
   * Stops polling once all items are ready (or rejected).
   */
  const processingIds = items
    .filter((item) => item.processingStatus === "processing")
    .slice(0, 50)
    .map((item) => item.id);
  const applyStatuses = useCallback(
    (statuses: ProcessingItemStatus[]) => {
      const byId = new Map(statuses.map((item) => [item.id, item.processingStatus]));
      cache.set<FeedCacheData>(["feed", filterKey], (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) => {
                const processingStatus = byId.get(item.id);
                return processingStatus ? { ...item, processingStatus } : item;
              }),
            }
          : current
      );
    },
    [cache, filterKey]
  );
  const finishProcessing = useCallback(() => {
    void Promise.all([cache.invalidate(["feed"]), cache.invalidate(["today"])]);
  }, [cache]);
  useProcessingStatusPoll(processingIds, applyStatuses, finishProcessing);

  /** Rejected items remain confined to Settings even if an API regresses. */
  const filteredItems = items.filter((item) => item.processingStatus !== "rejected");
  // Until the typed text reaches the URL, narrow what is already loaded.
  const draftNeedle = searchDraft.trim().toLowerCase();
  const narrowing =
    Boolean(draftNeedle) && normalizeSearchQuery(searchDraft) !== filters.searchQuery;
  const visibleItems = narrowing
    ? filteredItems.filter((item) => matchesDraft(item, draftNeedle))
    : filteredItems;
  const topicOptions = Array.from(new Set(items.flatMap((item) => item.topics))).sort();
  const replaceFilters = (updates: FilterUpdates) => {
    const currentParams = pendingUrl
      ? searchParamsForFeedUrl(pendingUrl)
      : new URLSearchParams(searchParams.toString());
    const nextUrl = nextFeedUrl(currentParams, updates);
    const nextKey = feedFilterKey(feedFilterState(searchParamsForFeedUrl(nextUrl)));
    setPendingNavigation({
      url: nextUrl,
      key: nextKey,
      originKey: urlFilterKey,
      acknowledged: nextKey === urlFilterKey,
      previousPage: page,
    });
    window.history.replaceState(null, "", nextUrl);
  };

  /** Optimistically mark an item as read in local state. */
  function handleMarkRead(id: string, read: boolean) {
    cache.set<FeedCacheData>(cacheKey, (current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, isRead: read } : item)),
          }
        : current
    );
  }

  /** Keyboard `r`: use the shared cross-view optimistic mutation. */
  async function persistRead(id: string) {
    try {
      await updateItem(id, { isRead: true });
    } catch {
      // The shared mutation restores only this item's fields on failure.
    }
  }

  // The row area menu is role="menu", not a dialog: silence shortcuts while it is open.
  useShortcutsSuspended(areaOpenId !== null);

  useRowNavigation(listRef, {
    onMarkRead: (id) => void persistRead(id),
    onOpenArea: (id) => setAreaOpenId(id),
  });
  useShortcut(FILTERS_SHORTCUT, () => setFiltersOpen(true));
  useShortcut(UNREAD_SHORTCUT, () => replaceFilters({ read: filters.showRead ? "false" : "true" }));
  useShortcut(LAYOUT_SHORTCUT, () => setViewMode((mode) => (mode === "card" ? "compact" : "card")));

  const emptyMessage = filters.searchQuery
    ? `Nothing matches “${filters.searchQuery}” with these filters.`
    : narrowing
      ? `Nothing on this page matches “${searchDraft.trim()}”.`
      : "No items match your filters.";

  return (
    <div ref={listRef} className="space-y-5">
      {/* Page header: title and links, with the search and Filters on the right. */}
      <FilterBar
        filters={filters}
        onChange={replaceFilters}
        onSearchDraftChange={setSearchDraft}
        leading={
          <div className="flex items-baseline gap-4">
            <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
            <nav aria-label="Feed views" className="flex gap-3 text-sm text-muted-foreground">
              <Link href="/archive" className="hover:text-foreground">
                Archive
              </Link>
            </nav>
            <span className="text-xs text-muted-foreground">
              {updatedLabel(feedQuery.dataUpdatedAt)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void feedQuery.refetch()}
              disabled={feedQuery.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${feedQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
        sheet={
          <FeedFilterSheet
            filters={filters}
            onChange={replaceFilters}
            activeCount={activeFilterChips(filters).length}
            topicOptions={topicOptions}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
          />
        }
      />

      {loadError && page && (
        <p className="text-sm text-destructive" role="alert">
          Could not refresh Feed. Showing the last loaded items.
        </p>
      )}

      {/* A cache miss keeps the previous page visible while the next key loads. */}
      <div
        className={`${viewMode === "card" ? "space-y-3" : "space-y-1"}${feedQuery.isFetching && !feedQuery.data ? " opacity-60 transition-opacity" : ""}`}
        aria-busy={feedQuery.isFetching || loading}
      >
        {loading ? (
          // Loading state shown while the first API fetch is in flight.
          <div className="py-12 text-center text-muted-foreground">Loading…</div>
        ) : loadError && filteredItems.length === 0 ? (
          <div
            className="mx-auto max-w-3xl rounded-xl border border-destructive/40 p-5 text-sm"
            role="alert"
          >
            <p className="font-medium">Feed is unavailable</p>
            <p className="mt-1 text-muted-foreground">{loadError}</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground" role="status">
            {emptyMessage}
          </div>
        ) : (
          visibleItems.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              compact={viewMode === "compact"}
              onMarkRead={handleMarkRead}
              filter={filters.showRead ? "all" : "unread"}
              areaOpen={areaOpenId === item.id}
              onAreaOpenChange={(open) => setAreaOpenId(open ? item.id : null)}
            />
          ))
        )}
      </div>
      {loadMoreError && (
        <p className="text-center text-sm text-destructive" role="alert">
          {loadMoreError}
        </p>
      )}
      {nextCursor && !loading && !narrowing && (
        <div className="flex justify-center">
          <button
            type="button"
            data-load-more
            className="min-h-11 rounded-md border px-4 text-sm font-medium hover:bg-accent"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
