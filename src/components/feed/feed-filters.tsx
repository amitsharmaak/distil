"use client";

import * as React from "react";
import { LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SourceType, ContentType, Priority } from "@/lib/types";
import type { FeedArchiveFilter, FeedSort } from "@/lib/feed/feed-query";
import { cn } from "@/lib/utils";

const sourceOptions: { value: SourceType; label: string }[] = [
  { value: "gmail", label: "Gmail" },
  { value: "slack", label: "Slack" },
  { value: "browser-extension", label: "Extension" },
  { value: "manual", label: "Manual" },
];

const contentTypeOptions: { value: ContentType; label: string }[] = [
  { value: "article", label: "Articles" },
  { value: "video", label: "Videos" },
  { value: "podcast", label: "Podcasts" },
];

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

interface FeedFiltersProps {
  viewMode: "card" | "compact";
  onViewModeChange: (mode: "card" | "compact") => void;
  selectedSources: SourceType[];
  onSourcesChange: (sources: SourceType[]) => void;
  selectedTypes: ContentType[];
  onTypesChange: (types: ContentType[]) => void;
  selectedPriorities: Priority[];
  onPrioritiesChange: (priorities: Priority[]) => void;
  showRead: boolean;
  onShowReadChange: (show: boolean) => void;
  archive: FeedArchiveFilter;
  onArchiveChange: (archive: FeedArchiveFilter) => void;
  sort: FeedSort;
  onSortChange: (sort: FeedSort) => void;
  selectedTopics: string[];
  onTopicsChange: (topics: string[]) => void;
  topicOptions: string[];
  selectedCollections: string[];
  onCollectionsChange: (collections: string[]) => void;
  collectionOptions: { id: string; name: string }[];
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
}

function FilterPill({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
        selected
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-accent"
      )}
    >
      {label}
    </button>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (values: T[]) => void;
}) {
  const toggle = (value: T) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((opt) => (
          <FilterPill
            key={opt.value}
            label={opt.label}
            selected={selected.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
          />
        ))}
      </div>
    </div>
  );
}

const fieldClass = "mt-1 min-h-10 w-full rounded-md border bg-card px-2 text-sm text-foreground";

/**
 * Feed toolbar: sort and the unread toggle stay inline on every breakpoint;
 * everything else lives in a bottom sheet so the list, not the controls, leads.
 */
export function FeedFilters({
  viewMode,
  onViewModeChange,
  selectedSources,
  onSourcesChange,
  selectedTypes,
  onTypesChange,
  selectedPriorities,
  onPrioritiesChange,
  showRead,
  onShowReadChange,
  archive,
  onArchiveChange,
  sort,
  onSortChange,
  selectedTopics,
  onTopicsChange,
  topicOptions,
  selectedCollections,
  onCollectionsChange,
  collectionOptions,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: FeedFiltersProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Sort and read state are visible inline, so only the hidden controls count.
  const activeCount =
    selectedSources.length +
    selectedTypes.length +
    selectedPriorities.length +
    selectedTopics.length +
    selectedCollections.length +
    (archive !== "exclude" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="feed-sort">
        Sort
      </label>
      <select
        id="feed-sort"
        value={sort}
        onChange={(event) => onSortChange(event.target.value as FeedSort)}
        className="min-h-9 rounded-md border bg-card px-2 text-sm text-foreground"
      >
        <option value="for_you">For you</option>
        <option value="recent">Most recent</option>
        <option value="priority">Priority</option>
      </select>

      <button
        type="button"
        onClick={() => onShowReadChange(!showRead)}
        aria-pressed={!showRead}
        className={cn(
          "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
          !showRead
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:bg-accent"
        )}
      >
        {showRead ? "Showing all" : "Unread only"}
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto min-h-9 gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 rounded-full px-1 text-xs">
                {activeCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-xl pb-safe">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-5 px-4 pb-4">
            <FilterGroup
              label="Priority"
              options={priorityOptions}
              selected={selectedPriorities}
              onChange={onPrioritiesChange}
            />
            <FilterGroup
              label="Source"
              options={sourceOptions}
              selected={selectedSources}
              onChange={onSourcesChange}
            />
            <FilterGroup
              label="Type"
              options={contentTypeOptions}
              selected={selectedTypes}
              onChange={onTypesChange}
            />
            {topicOptions.length > 0 && (
              <FilterGroup
                label="Topic"
                options={topicOptions.map((topic) => ({ value: topic, label: topic }))}
                selected={selectedTopics}
                onChange={onTopicsChange}
              />
            )}
            {collectionOptions.length > 0 && (
              <FilterGroup
                label="Collection"
                options={collectionOptions.map((collection) => ({
                  value: collection.id,
                  label: collection.name,
                }))}
                selected={selectedCollections}
                onChange={onCollectionsChange}
              />
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-muted-foreground">
                Archive
                <select
                  value={archive}
                  onChange={(event) => onArchiveChange(event.target.value as FeedArchiveFilter)}
                  className={fieldClass}
                >
                  <option value="exclude">Active only</option>
                  <option value="include">Include archived</option>
                  <option value="only">Archived only</option>
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                From date
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => onDateFromChange(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                To date
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => onDateToChange(event.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Layout</span>
              <div className="flex items-center rounded-lg border border-border">
                <Button
                  variant={viewMode === "card" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-r-none"
                  aria-label="Card layout"
                  aria-pressed={viewMode === "card"}
                  onClick={() => onViewModeChange("card")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "compact" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-l-none"
                  aria-label="Compact layout"
                  aria-pressed={viewMode === "compact"}
                  onClick={() => onViewModeChange("compact")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
