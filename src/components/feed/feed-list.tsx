"use client";

/**
 * Feed client island.
 *
 * The URL is the single source of truth for the filters and the search: the
 * server page parses it, renders the first page of items and passes them in
 * as `initialPage`; every filter change (including a committed search) is a
 * `router.replace` (scroll kept) that makes the server render the new page.
 * Only load-more and the processing-status poll talk to the API from here.
 *
 * While a search is being typed, the items already on screen are narrowed
 * locally at once; the debounced URL change then brings the server's answer.
 *
 * Without `initialPage` (the legacy SQLite path, or a request with no
 * server-side user) the island fetches the page itself.
 */

import { startTransition, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ContentCard } from "@/components/feed/content-card";
import { FeedFilterSheet } from "@/components/feed/feed-filters";
import { FilterBar } from "@/components/feed/filter-bar";
import {
  feedFilterKey,
  feedFilterState,
  feedRequestSearch,
  normalizeSearchQuery,
  type FeedFilterState,
} from "@/lib/feed/feed-url";
import { activeFilterChips, filtersUrl, type FilterUpdates } from "@/lib/feed/quick-filters";
import type { ContentItemSummary } from "@/lib/types";

export interface FeedInitialPage {
  /** `feedFilterKey` of the URL the server rendered for; must match to be used. */
  key: string;
  items: ContentItemSummary[];
  nextCursor?: string;
  collections: { id: string; name: string }[];
}

type FeedResponse = {
  items?: ContentItemSummary[];
  nextCursor?: string;
  error?: { message?: string };
};

function requestPath(state: FeedFilterState, cursor?: string): string {
  return `/api/v1/feed?${feedRequestSearch(state, cursor).toString()}`;
}

export function nextFeedUrl(current: URLSearchParams, updates: FilterUpdates): string {
  return filtersUrl("/feed", current, updates);
}

/** Case-insensitive match on what a card shows, for the instant local narrowing. */
function matchesDraft(item: ContentItemSummary, needle: string): boolean {
  return [item.title, item.publication, item.author].some((value) =>
    value?.toLowerCase().includes(needle)
  );
}

export function FeedList({ initialPage }: { initialPage: FeedInitialPage | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = feedFilterState(searchParams);
  const filterKey = feedFilterKey(filters);
  const serverPage = initialPage && initialPage.key === filterKey ? initialPage : null;

  const [items, setItems] = useState<ContentItemSummary[]>(serverPage?.items ?? []);
  /** Filter key represented by `items`; null until the first load settles. */
  const [loadedKey, setLoadedKey] = useState<string | null>(serverPage ? filterKey : null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(serverPage?.nextCursor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>(
    serverPage?.collections ?? []
  );
  const [viewMode, setViewMode] = useState<"card" | "compact">("card");
  const [searchDraft, setSearchDraft] = useState(filters.searchQuery);
  const [isPending, startNavigation] = useTransition();

  // A new server page (after router.replace) replaces the list in one step.
  useEffect(() => {
    if (!serverPage) return;
    startTransition(() => {
      setItems(serverPage.items);
      setNextCursor(serverPage.nextCursor);
      setCollections(serverPage.collections);
      setLoadedKey(serverPage.key);
      setLoadError(null);
    });
  }, [serverPage]);

  const fetchItems = useCallback(
    (cursor?: string, append = false) =>
      fetch(requestPath(filters, cursor))
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as FeedResponse;
          if (!res.ok) throw new Error(data.error?.message || "Unable to load your feed.");
          const nextItems = data.items ?? [];
          setItems((current) => (append ? [...current, ...nextItems] : nextItems));
          setNextCursor(data.nextCursor);
          setLoadError(null);
          setLoadedKey(filterKey);
          return nextItems;
        })
        .catch((cause: unknown) => {
          setLoadError(cause instanceof Error ? cause.message : "Unable to load your feed.");
          if (!append) {
            setItems([]);
            setLoadedKey(filterKey);
          }
          return [] as ContentItemSummary[];
        }),
    // `filters` is derived from the URL; `filterKey` is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey]
  );

  // Client fetch only when the server did not render this exact page.
  useEffect(() => {
    if (serverPage || loadedKey === filterKey) return;
    void fetchItems(filters.cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPage, loadedKey, filterKey, fetchItems]);

  const hasServerPage = Boolean(serverPage);
  useEffect(() => {
    if (hasServerPage) return;
    let cancelled = false;
    fetch("/api/v1/collections")
      .then((res) => res.json())
      .then((data: { collections?: { id: string; name: string }[] }) => {
        if (!cancelled) setCollections(data.collections ?? []);
      })
      .catch(() => {
        if (!cancelled) setCollections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasServerPage]);

  const loading = loadedKey !== filterKey;

  /**
   * Poll every 3 seconds while any items are in processing state.
   * Stops polling once all items are ready (or rejected).
   */
  const processingKey = items
    .filter((item) => item.processingStatus === "processing")
    .slice(0, 50)
    .map((item) => item.id)
    .join(",");

  useEffect(() => {
    if (!processingKey) return;
    let cancelled = false;
    const pollStatuses = async () => {
      try {
        const response = await fetch(
          `/api/v1/items/status?ids=${encodeURIComponent(processingKey)}`
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          items?: Array<{
            id: string;
            processingStatus: NonNullable<ContentItemSummary["processingStatus"]>;
          }>;
        };
        if (cancelled || !payload.items?.length) return;
        const statuses = new Map(payload.items.map((item) => [item.id, item.processingStatus]));
        setItems((current) =>
          current.map((item) => {
            const processingStatus = statuses.get(item.id);
            return processingStatus ? { ...item, processingStatus } : item;
          })
        );
      } catch {
        // A transient poll failure leaves the current cards intact; the next
        // interval retries while an item is still processing.
      }
    };
    const interval = setInterval(() => void pollStatuses(), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [processingKey]);

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
  const collectionNames = useMemo(
    () => Object.fromEntries(collections.map(({ id, name }) => [id, name])),
    [collections]
  );

  const replaceFilters = (updates: FilterUpdates) => {
    startNavigation(() => {
      router.replace(nextFeedUrl(searchParams, updates), { scroll: false });
    });
  };

  /** Optimistically mark an item as read in local state. */
  function handleMarkRead(id: string, read: boolean) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: read } : item))
    );
  }

  const emptyMessage = filters.searchQuery
    ? `Nothing matches “${filters.searchQuery}” with these filters.`
    : narrowing
      ? `Nothing on this page matches “${searchDraft.trim()}”.`
      : "No items match your filters.";

  return (
    <div className="space-y-5">
      {/* Page header: title and links, with the search and Filters on the right. */}
      <FilterBar
        filters={filters}
        onChange={replaceFilters}
        onSearchDraftChange={setSearchDraft}
        collectionNames={collectionNames}
        leading={
          <div className="flex items-baseline gap-4">
            <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
            <nav aria-label="Feed views" className="flex gap-3 text-sm text-muted-foreground">
              <Link href="/collections" className="hover:text-foreground">
                Collections
              </Link>
              <Link href="/archive" className="hover:text-foreground">
                Archive
              </Link>
            </nav>
          </div>
        }
        sheet={
          <FeedFilterSheet
            filters={filters}
            onChange={replaceFilters}
            activeCount={activeFilterChips(filters, collectionNames).length}
            topicOptions={topicOptions}
            collectionOptions={collections}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        }
      />

      {/* Item list; a pending navigation keeps the current page visible, dimmed. */}
      <div
        className={`${viewMode === "card" ? "space-y-3" : "space-y-1"}${isPending ? " opacity-60 transition-opacity" : ""}`}
        aria-busy={isPending || loading}
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
            />
          ))
        )}
      </div>
      {nextCursor && !loading && !narrowing && (
        <div className="flex justify-center">
          <button
            type="button"
            className="min-h-11 rounded-md border px-4 text-sm font-medium hover:bg-accent"
            onClick={() => void fetchItems(nextCursor, true)}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
