"use client";

/**
 * Feed client island.
 *
 * The URL is the single source of truth for the filters: the server page
 * parses it, renders the first page of items and passes them in as
 * `initialPage`; every filter change is a `router.replace` (scroll kept) that
 * makes the server render the new page. Only load-more and the bounded
 * processing-status poll talk to the API from here.
 *
 * Without `initialPage` (search results, the legacy SQLite path, or a request
 * with no server-side user) the island fetches the page itself, exactly as
 * the old client page did.
 */

import { startTransition, useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ContentCard } from "@/components/feed/content-card";
import { FeedFilters } from "@/components/feed/feed-filters";
import {
  dateQueryValue,
  feedFilterKey,
  feedFilterState,
  feedRequestSearch,
  type FeedFilterState,
} from "@/lib/feed/feed-url";
import type { FeedArchiveFilter, FeedSort } from "@/lib/feed/feed-query";
import type { ContentItemSummary, ContentType, Priority, SourceType } from "@/lib/types";

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
  // Phase 2 owns normal consumption queries. Search remains on the legacy
  // endpoint until the cited keyword-search route is wired in its next slice.
  if (state.searchQuery) {
    const query = new URLSearchParams({ includeProcessing: "true", q: state.searchQuery });
    return `/api/items?${query.toString()}`;
  }
  return `/api/v1/feed?${feedRequestSearch(state, cursor).toString()}`;
}

function nextUrl(
  current: URLSearchParams,
  updates: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams(current);
  for (const [name, value] of Object.entries(updates)) {
    params.delete(name);
    if (Array.isArray(value)) value.forEach((entry) => params.append(name, entry));
    else if (value) params.set(name, value);
  }
  params.delete("cursor");
  const search = params.toString();
  return search ? `/feed?${search}` : "/feed";
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

  useEffect(() => {
    if (serverPage || filters.searchQuery) return;
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
  }, [serverPage, filters.searchQuery]);

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
  const topicOptions = Array.from(new Set(items.flatMap((item) => item.topics))).sort();

  const replaceFilters = (updates: Record<string, string | string[] | undefined>) => {
    startNavigation(() => {
      router.replace(nextUrl(searchParams, updates), { scroll: false });
    });
  };

  /** Optimistically mark an item as read in local state. */
  function handleMarkRead(id: string, read: boolean) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: read } : item))
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
          <div className="flex gap-3 text-sm text-muted-foreground">
            <Link href="/collections" className="hover:text-foreground">
              Collections
            </Link>
            <Link href="/archive" className="hover:text-foreground">
              Archive
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground">
          {filters.searchQuery
            ? `Search results for "${filters.searchQuery}"`
            : "All your content from every source"}
        </p>
      </div>

      {/* Filter bar */}
      <FeedFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedSources={filters.sources}
        onSourcesChange={(values: SourceType[]) => replaceFilters({ source: values })}
        selectedTypes={filters.contentTypes}
        onTypesChange={(values: ContentType[]) => replaceFilters({ contentType: values })}
        selectedPriorities={filters.priorities}
        onPrioritiesChange={(values: Priority[]) => replaceFilters({ priority: values })}
        showRead={filters.showRead}
        onShowReadChange={(value: boolean) =>
          replaceFilters({ read: value ? "true" : "false", showRead: undefined })
        }
        archive={filters.archive}
        onArchiveChange={(value: FeedArchiveFilter) => replaceFilters({ archive: value })}
        sort={filters.sort}
        onSortChange={(value: FeedSort) => replaceFilters({ sort: value })}
        selectedTopics={filters.topics}
        onTopicsChange={(values: string[]) => replaceFilters({ topic: values })}
        topicOptions={topicOptions}
        selectedCollections={filters.collections}
        onCollectionsChange={(values: string[]) => replaceFilters({ collection: values })}
        collectionOptions={collections}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onDateFromChange={(value: string) =>
          replaceFilters({ dateFrom: value ? dateQueryValue(value) : undefined })
        }
        onDateToChange={(value: string) =>
          replaceFilters({ dateTo: value ? dateQueryValue(value, true) : undefined })
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
        ) : filteredItems.length === 0 ? (
          // Empty state when filters match nothing (or search returns nothing).
          <div className="py-12 text-center text-muted-foreground">
            {filters.searchQuery
              ? `No results found for "${filters.searchQuery}"`
              : "No items match your filters."}
          </div>
        ) : (
          filteredItems.map((item) => (
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
      {nextCursor && !loading && (
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
