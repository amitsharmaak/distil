"use client";

/**
 * Feed page — lists all content items with multi-dimensional filtering.
 *
 * This is a client component because it uses React state for interactive
 * filters (source, type, priority, read status). Items are fetched from
 * the API on mount and whenever filters are cleared/reset.
 *
 * The `filteredItems` computation happens client-side so filter changes
 * feel instant — no round-trip for each filter toggle.
 *
 * useSearchParams() requires a Suspense boundary, so the actual page
 * content lives in FeedPageContent and FeedPage wraps it in <Suspense>.
 */

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ContentCard } from "@/components/feed/content-card";
import { FeedFilters } from "@/components/feed/feed-filters";
import type { ContentItem, SourceType, ContentType, Priority } from "@/lib/types";
import { config } from "@/lib/config";
import type { FeedArchiveFilter, FeedSort } from "@/lib/feed/feed-query";

function queryValues(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function dateQueryValue(value: string, end = false): string {
  return value ? `${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : "";
}

function updateFeedUrl(updates: Record<string, string | string[] | undefined>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(updates)) {
    url.searchParams.delete(name);
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(name, entry));
    else if (value) url.searchParams.set(name, value);
  }
  url.searchParams.delete("cursor");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function FeedPageContent() {
  // ── State ───────────────────────────────────────────────────────────────────

  /** All items fetched from the API. */
  const [items, setItems] = useState<ContentItem[]>([]);
  /** Search query represented by the current items; null until the first fetch settles. */
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  /** Message from the last failed fetch; null when the last fetch succeeded. */
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Card layout vs compact list layout toggle. */
  const [viewMode, setViewMode] = useState<"card" | "compact">("card");

  /** Full-text search query from URL search params. */
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";

  /** Active filter selections — empty array means "show all". */
  const [selectedSources, setSelectedSources] = useState<SourceType[]>(
    () => queryValues(searchParams, "source") as SourceType[]
  );
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(
    () => queryValues(searchParams, "contentType") as ContentType[]
  );
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>(
    () => queryValues(searchParams, "priority") as Priority[]
  );
  const [selectedTopics, setSelectedTopics] = useState<string[]>(() =>
    queryValues(searchParams, "topic")
  );
  const [selectedCollections, setSelectedCollections] = useState<string[]>(() =>
    queryValues(searchParams, "collection")
  );
  const [archive, setArchive] = useState<FeedArchiveFilter>(
    () => (searchParams.get("archive") as FeedArchiveFilter) || "exclude"
  );
  const [sort, setSort] = useState<FeedSort>(
    () => (searchParams.get("sort") as FeedSort) || "for_you"
  );
  const [dateFrom, setDateFrom] = useState(() => (searchParams.get("dateFrom") ?? "").slice(0, 10));
  const [dateTo, setDateTo] = useState(() => (searchParams.get("dateTo") ?? "").slice(0, 10));

  /** When false, already-read items are hidden. Initialized from ?showRead=true param. */
  const [showRead, setShowRead] = useState(() => {
    const read = searchParams.get("read");
    return read ? read === "true" : searchParams.get("showRead") === "true";
  });
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const initialCursor = useRef<string | undefined>(searchParams.get("cursor") ?? undefined);

  // ── Data fetching ───────────────────────────────────────────────────────────

  /**
   * Fetch items from the API. includeProcessing=true ensures items still in
   * the pipeline show with skeleton UI. When a search query is present, it is
   * forwarded to the API for FTS5 full-text filtering.
   */
  const fetchItems = useCallback(
    (cursor?: string, append = false) => {
      // Phase 2 owns normal consumption queries. Search remains on the legacy
      // endpoint until the cited keyword-search route is wired in its next slice.
      const url = new URL(`${config.apiBaseUrl}${searchQuery ? "/api/items" : "/api/v1/feed"}`);
      if (searchQuery) {
        url.searchParams.set("includeProcessing", "true");
        url.searchParams.set("q", searchQuery);
      } else {
        url.searchParams.set("archive", archive);
        url.searchParams.set("sort", sort);
        url.searchParams.set("limit", "100");
        if (!showRead) url.searchParams.set("read", "false");
        selectedTopics.forEach((topic) => url.searchParams.append("topic", topic));
        selectedSources.forEach((source) => url.searchParams.append("source", source));
        selectedTypes.forEach((type) => url.searchParams.append("contentType", type));
        selectedPriorities.forEach((priority) => url.searchParams.append("priority", priority));
        selectedCollections.forEach((collection) =>
          url.searchParams.append("collection", collection)
        );
        if (dateFrom) url.searchParams.set("dateFrom", dateQueryValue(dateFrom));
        if (dateTo) url.searchParams.set("dateTo", dateQueryValue(dateTo, true));
        if (cursor) url.searchParams.set("cursor", cursor);
      }
      return fetch(url.toString())
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            items?: ContentItem[];
            nextCursor?: string;
            error?: { message?: string };
          };
          if (!res.ok) {
            throw new Error(data.error?.message || "Unable to load your feed.");
          }
          const nextItems = data.items ?? [];
          setItems((current) => (append ? [...current, ...nextItems] : nextItems));
          setNextCursor(data.nextCursor);
          setLoadError(null);
          setLoadedQuery(searchQuery);
          return nextItems;
        })
        .catch((cause: unknown) => {
          setLoadError(cause instanceof Error ? cause.message : "Unable to load your feed.");
          if (!append) {
            setItems([]);
            setLoadedQuery(searchQuery);
          }
          return [] as ContentItem[];
        });
    },
    [
      archive,
      dateFrom,
      dateTo,
      searchQuery,
      selectedCollections,
      selectedPriorities,
      selectedSources,
      selectedTopics,
      selectedTypes,
      showRead,
      sort,
    ]
  );

  useEffect(() => {
    const cursor = initialCursor.current;
    initialCursor.current = undefined;
    fetchItems(cursor);
  }, [fetchItems]);

  useEffect(() => {
    if (searchQuery) return;
    let cancelled = false;
    fetch(`${config.apiBaseUrl}/api/v1/collections`)
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
  }, [searchQuery]);

  const loading = loadedQuery !== searchQuery;

  /**
   * Poll every 3 seconds while any items are in processing state.
   * Stops polling once all items are ready (or rejected).
   */
  const hasProcessingItems = items.some((item) => item.processingStatus === "processing");

  useEffect(() => {
    if (!hasProcessingItems) return;
    const interval = setInterval(() => fetchItems(), 3000);
    return () => clearInterval(interval);
  }, [hasProcessingItems, fetchItems]);

  // ── Filtering ───────────────────────────────────────────────────────────────

  /**
   * Apply active filters to the full items array.
   * Each filter is skipped when its selection is empty (show-all behaviour).
   */
  const filteredItems = items.filter((item) => {
    // Rejected items are shown in Settings for review, not in the feed.
    if (item.processingStatus === "rejected") return false;
    if (selectedSources.length > 0 && !selectedSources.includes(item.sourceType)) return false;
    if (selectedTypes.length > 0 && !selectedTypes.includes(item.contentType)) return false;
    if (selectedPriorities.length > 0 && !selectedPriorities.includes(item.priority)) return false;
    // Search always shows both read and unread; otherwise respect the toggle.
    if (!searchQuery && !showRead && item.isRead) return false;
    return true;
  });

  const topicOptions = Array.from(new Set(items.flatMap((item) => item.topics))).sort();

  const setSources = (values: SourceType[]) => {
    setSelectedSources(values);
    updateFeedUrl({ source: values });
  };
  const setTypes = (values: ContentType[]) => {
    setSelectedTypes(values);
    updateFeedUrl({ contentType: values });
  };
  const setPriorities = (values: Priority[]) => {
    setSelectedPriorities(values);
    updateFeedUrl({ priority: values });
  };
  const setTopics = (values: string[]) => {
    setSelectedTopics(values);
    updateFeedUrl({ topic: values });
  };
  const setCollectionFilter = (values: string[]) => {
    setSelectedCollections(values);
    updateFeedUrl({ collection: values });
  };
  const setReadFilter = (value: boolean) => {
    setShowRead(value);
    updateFeedUrl({ read: value ? "true" : "false", showRead: undefined });
  };
  const setArchiveFilter = (value: FeedArchiveFilter) => {
    setArchive(value);
    updateFeedUrl({ archive: value });
  };
  const setSortFilter = (value: FeedSort) => {
    setSort(value);
    updateFeedUrl({ sort: value });
  };
  const setFromDate = (value: string) => {
    setDateFrom(value);
    updateFeedUrl({ dateFrom: value ? dateQueryValue(value) : undefined });
  };
  const setToDate = (value: string) => {
    setDateTo(value);
    updateFeedUrl({ dateTo: value ? dateQueryValue(value, true) : undefined });
  };

  /** Optimistically mark an item as read in local state. */
  function handleMarkRead(id: string) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
          {searchQuery
            ? `Search results for "${searchQuery}"`
            : "All your content from every source"}
        </p>
      </div>

      {/* Filter bar */}
      <FeedFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedSources={selectedSources}
        onSourcesChange={setSources}
        selectedTypes={selectedTypes}
        onTypesChange={setTypes}
        selectedPriorities={selectedPriorities}
        onPrioritiesChange={setPriorities}
        showRead={showRead}
        onShowReadChange={setReadFilter}
        archive={archive}
        onArchiveChange={setArchiveFilter}
        sort={sort}
        onSortChange={setSortFilter}
        selectedTopics={selectedTopics}
        onTopicsChange={setTopics}
        topicOptions={topicOptions}
        selectedCollections={selectedCollections}
        onCollectionsChange={setCollectionFilter}
        collectionOptions={collections}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setFromDate}
        onDateToChange={setToDate}
      />

      {/* Item list */}
      <div className={viewMode === "card" ? "space-y-3" : "space-y-1"}>
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
            {searchQuery ? `No results found for "${searchQuery}"` : "No items match your filters."}
          </div>
        ) : (
          filteredItems.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              compact={viewMode === "compact"}
              onMarkRead={handleMarkRead}
              filter={showRead ? "all" : "unread"}
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

export default function FeedPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading...</div>}>
      <FeedPageContent />
    </Suspense>
  );
}
