"use client";

import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SourceType, ContentType, Priority } from "@/lib/types";

const sourceOptions: { value: SourceType; label: string }[] = [
  { value: "gmail", label: "Gmail" },
  { value: "slack", label: "Slack" },
  { value: "twitter", label: "Twitter" },
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
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-medium">{label}:</span>
      {options.map((opt) => (
        <Badge
          key={opt.value}
          variant={selected.includes(opt.value) ? "default" : "outline"}
          className="cursor-pointer text-[11px]"
          onClick={() => toggle(opt.value)}
        >
          {opt.label}
        </Badge>
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
  return (
    <div className="space-y-3">
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
          <Badge
            variant={showRead ? "outline" : "default"}
            className="cursor-pointer text-[11px]"
            onClick={() => onShowReadChange(!showRead)}
          >
            {showRead ? "Showing all" : "Unread only"}
          </Badge>
          <div className="flex items-center rounded-lg border border-border">
            <Button
              variant={viewMode === "card" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => onViewModeChange("card")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "compact" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => onViewModeChange("compact")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
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
  );
}
