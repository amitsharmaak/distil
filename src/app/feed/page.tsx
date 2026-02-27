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
 */

import { useState, useEffect } from "react";
import { ContentCard } from "@/components/feed/content-card";
import { FeedFilters } from "@/components/feed/feed-filters";
import type { ContentItem, SourceType, ContentType, Priority } from "@/lib/types";
import { config } from "@/lib/config";

export default function FeedPage() {
  // ── State ───────────────────────────────────────────────────────────────────

  /** All items fetched from the API. */
  const [items, setItems] = useState<ContentItem[]>([]);
  /** True while the initial fetch is in flight. */
  const [loading, setLoading] = useState(true);

  /** Card layout vs compact list layout toggle. */
  const [viewMode, setViewMode] = useState<"card" | "compact">("card");

  /** Active filter selections — empty array means "show all". */
  const [selectedSources, setSelectedSources] = useState<SourceType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);

  /** When false, already-read items are hidden. */
  const [showRead, setShowRead] = useState(true);

  // ── Data fetching ───────────────────────────────────────────────────────────

  /**
   * Fetch all items from the API on initial mount.
   * All filtering is done client-side against this array so that filter
   * changes feel instant without additional network round-trips.
   */
  useEffect(() => {
    setLoading(true);
    fetch(`${config.apiBaseUrl}/api/items`)
      .then((res) => res.json())
      .then((data: { items: ContentItem[] }) => {
        setItems(data.items);
        setLoading(false);
      })
      .catch(() => {
        // On error, leave items empty and stop showing the loading state.
        setLoading(false);
      });
  }, []);

  // ── Filtering ───────────────────────────────────────────────────────────────

  /**
   * Apply active filters to the full items array.
   * Each filter is skipped when its selection is empty (show-all behaviour).
   */
  const filteredItems = items.filter((item) => {
    // Source filter: if any sources are selected, the item's sourceType must match one.
    if (selectedSources.length > 0 && !selectedSources.includes(item.sourceType)) return false;
    // Content type filter.
    if (selectedTypes.length > 0 && !selectedTypes.includes(item.contentType)) return false;
    // Priority filter.
    if (selectedPriorities.length > 0 && !selectedPriorities.includes(item.priority)) return false;
    // Read/unread toggle: hide read items when showRead is false.
    if (!showRead && item.isRead) return false;
    return true;
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="text-muted-foreground">All your content from every source</p>
      </div>

      {/* Filter bar */}
      <FeedFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedSources={selectedSources}
        onSourcesChange={setSelectedSources}
        selectedTypes={selectedTypes}
        onTypesChange={setSelectedTypes}
        selectedPriorities={selectedPriorities}
        onPrioritiesChange={setSelectedPriorities}
        showRead={showRead}
        onShowReadChange={setShowRead}
      />

      {/* Item list */}
      <div className={viewMode === "card" ? "space-y-3" : "space-y-1"}>
        {loading ? (
          // Loading state shown while the first API fetch is in flight.
          <div className="py-12 text-center text-muted-foreground">Loading…</div>
        ) : filteredItems.length === 0 ? (
          // Empty state when filters match nothing.
          <div className="py-12 text-center text-muted-foreground">
            No items match your filters.
          </div>
        ) : (
          filteredItems.map((item) => (
            <ContentCard key={item.id} item={item} compact={viewMode === "compact"} />
          ))
        )}
      </div>
    </div>
  );
}
