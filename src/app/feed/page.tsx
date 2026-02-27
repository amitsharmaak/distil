"use client";

import { useState } from "react";
import { ContentCard } from "@/components/feed/content-card";
import { FeedFilters } from "@/components/feed/feed-filters";
import { mockItems } from "@/lib/mock-data";
import { SourceType, ContentType, Priority } from "@/lib/types";

export default function FeedPage() {
  const [viewMode, setViewMode] = useState<"card" | "compact">("card");
  const [selectedSources, setSelectedSources] = useState<SourceType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([]);
  const [showRead, setShowRead] = useState(true);

  const filteredItems = mockItems.filter((item) => {
    if (selectedSources.length > 0 && !selectedSources.includes(item.sourceType))
      return false;
    if (selectedTypes.length > 0 && !selectedTypes.includes(item.contentType))
      return false;
    if (
      selectedPriorities.length > 0 &&
      !selectedPriorities.includes(item.priority)
    )
      return false;
    if (!showRead && item.isRead) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feed</h1>
        <p className="text-muted-foreground">
          All your content from every source
        </p>
      </div>

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

      <div className={viewMode === "card" ? "space-y-3" : "space-y-1"}>
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No items match your filters.
          </div>
        ) : (
          filteredItems.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              compact={viewMode === "compact"}
            />
          ))
        )}
      </div>
    </div>
  );
}
