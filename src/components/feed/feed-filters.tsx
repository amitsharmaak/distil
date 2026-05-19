"use client";

import * as React from "react";
import { LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SourceType, ContentType, Priority } from "@/lib/types";
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
}

function FilterPill<T extends string>({
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
      onClick={onToggle}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        selected
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-border hover:bg-accent",
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
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}:
      </span>
      {options.map((opt) => (
        <FilterPill
          key={opt.value}
          label={opt.label}
          selected={selected.includes(opt.value)}
          onToggle={() => toggle(opt.value)}
        />
      ))}
    </div>
  );
}

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
}: FeedFiltersProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const activeCount =
    selectedSources.length +
    selectedTypes.length +
    selectedPriorities.length +
    (showRead ? 0 : 1);

  const viewToggle = (
    <div className="flex items-center rounded-lg border border-border">
      <Button
        variant={viewMode === "card" ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7 rounded-r-none"
        onClick={() => onViewModeChange("card")}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={viewMode === "compact" ? "secondary" : "ghost"}
        size="icon"
        className="h-7 w-7 rounded-l-none"
        onClick={() => onViewModeChange("compact")}
      >
        <List className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const readToggle = (
    <button
      onClick={() => onShowReadChange(!showRead)}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        !showRead
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {showRead ? "Showing all" : "Unread only"}
    </button>
  );

  return (
    <div className="space-y-2.5">
      {/* Mobile: sheet trigger */}
      <div className="md:hidden flex items-center gap-2">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-5 rounded-full px-1 text-xs"
                >
                  {activeCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[80dvh] overflow-y-auto rounded-t-xl pb-safe"
          >
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-col gap-4 px-4 pb-4">
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Read:
                  </span>
                  {readToggle}
                </div>
                {viewToggle}
              </div>
            </div>
          </SheetContent>
        </Sheet>
        {/* Show view toggle inline on mobile too */}
        {viewToggle}
      </div>

      {/* Desktop: existing pill row, unchanged */}
      <div className="hidden md:block space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FilterGroup
              label="Priority"
              options={priorityOptions}
              selected={selectedPriorities}
              onChange={onPrioritiesChange}
            />
          </div>
          <div className="flex items-center gap-2">
            {readToggle}
            {viewToggle}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </div>
    </div>
  );
}
