"use client";

/**
 * The Filters sheet behind the filter bar's "Filters" button: sort and layout,
 * the area switch, unread, and every facet. Like the bar, it reads the URL
 * state (`filters`) and reports URL changes through `onChange`; every change
 * applies at once, so "Done" only closes the sheet. A side panel on wider
 * screens, a bottom sheet on phones. Today uses the same sheet without the
 * unread, archive and layout controls (`unreadQueue`, no `viewMode`), and
 * shows Sort only while it lists results (`showSort`).
 */

import * as React from "react";
import { Check, LayoutGrid, List, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { dateQueryValue, type FeedFilterState } from "@/lib/feed/feed-url";
import {
  AREA_OPTIONS,
  QUICK_FILTERS,
  RESET_SHEET_FILTERS,
  areaUpdate,
  selectedArea,
  type FilterUpdates,
} from "@/lib/feed/quick-filters";
import type { FeedArchiveFilter, FeedSort } from "@/lib/feed/feed-query";
import type { ContentType, LifeArea, Priority, SourceType } from "@/lib/types";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { value: FeedSort; label: string }[] = [
  { value: "for_you", label: "For you" },
  { value: "recent", label: "Recent" },
  { value: "priority", label: "Priority" },
];

const ARCHIVE_OPTIONS: { value: FeedArchiveFilter; label: string }[] = [
  { value: "exclude", label: "Active" },
  { value: "include", label: "All" },
  { value: "only", label: "Archived" },
];

const TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "article", label: "Articles" },
  { value: "video", label: "Videos" },
  { value: "podcast", label: "Podcasts" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "gmail", label: "Gmail" },
  { value: "slack", label: "Slack" },
  { value: "browser-extension", label: "Extension" },
  { value: "manual", label: "Manual" },
];

const UNREAD = QUICK_FILTERS.find((filter) => filter.id === "unread")!;
const X_POSTS = QUICK_FILTERS.find((filter) => filter.id === "x")!;

function toggled<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

const WIDE_QUERY = "(min-width: 640px)";

/** Side panel from `sm` up, bottom sheet below; only read while the sheet is open. */
function useWideScreen(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const query = window.matchMedia(WIDE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 id={id} className="text-[13px] font-medium text-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => {
              if (!checked) onSelect(option.value);
            }}
            className={cn(
              // Content-sized segments sharing the spare width: equal columns cut
              // "Personal" and "Learning" at phone width.
              "h-8 min-w-0 flex-auto truncate rounded-md px-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              checked
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Chip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        pressed
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
      )}
    >
      {pressed && <Check className="-ml-0.5 h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          pressed={selected.includes(option.value)}
          onClick={() => onToggle(option.value)}
        />
      ))}
    </div>
  );
}

const dateFieldClass =
  "mt-1.5 h-9 w-full rounded-md border bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

interface FeedFilterSheetProps {
  filters: FeedFilterState;
  onChange: (updates: FilterUpdates) => void;
  /** Number of filters in effect, shown on the trigger. */
  activeCount: number;
  topicOptions: string[];
  /** The card/compact layout toggle; hidden when the page has no layouts. */
  viewMode?: "card" | "compact";
  onViewModeChange?: (mode: "card" | "compact") => void;
  /**
   * The page lists only the unread queue (Today): the "Unread only" switch
   * and the Archive control have nothing to change there and are hidden.
   */
  unreadQueue?: boolean;
  /** Hide Sort (and the layout toggle beside it) where the view has a fixed order. */
  showSort?: boolean;
}

export function FeedFilterSheet({
  filters,
  onChange,
  activeCount,
  topicOptions,
  viewMode,
  onViewModeChange,
  unreadQueue = false,
  showSort = true,
}: FeedFilterSheetProps) {
  const [open, setOpen] = React.useState(false);
  const wide = useWideScreen();
  const unreadOnly = UNREAD.isActive(filters);
  const sortOptions: { value: FeedSort; label: string }[] = filters.searchQuery
    ? [{ value: "relevance", label: "Best match" }, ...SORT_OPTIONS]
    : SORT_OPTIONS;
  const typeSelected = [
    ...filters.contentTypes,
    ...(X_POSTS.isActive(filters) ? ["x" as const] : []),
  ];
  const layoutToggle =
    viewMode && onViewModeChange ? (
      <div role="group" aria-label="Layout" className="flex rounded-lg bg-muted p-0.5">
        {(
          [
            ["card", "Card layout", LayoutGrid],
            ["compact", "Compact layout", List],
          ] as const
        ).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            aria-label={label}
            aria-pressed={viewMode === mode}
            onClick={() => onViewModeChange(mode)}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              viewMode === mode
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    ) : undefined;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-9 shrink-0 gap-2 rounded-full">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          <span className="sr-only sm:hidden">Filters</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 min-w-5 rounded-full px-1 text-xs">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={cn(
          "gap-0 p-0",
          wide ? "w-full sm:max-w-[400px]" : "max-h-[88dvh] rounded-t-2xl pb-safe"
        )}
      >
        {!wide && (
          <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted" />
        )}
        <SheetHeader className="gap-0.5 border-b px-5 pt-4 pb-3.5">
          <SheetTitle className="text-base">Filters</SheetTitle>
          <SheetDescription className="text-[13px]">
            {activeCount > 0
              ? `${activeCount} active · changes apply as you go`
              : "Changes apply as you go"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {showSort && (
            <Section title="Sort" action={layoutToggle}>
              <Segmented
                label="Sort"
                options={sortOptions}
                value={filters.sort}
                onSelect={(sort) => onChange({ sort })}
              />
            </Section>
          )}

          <Section title="Area">
            <Segmented
              label="Area"
              options={AREA_OPTIONS.map((option) => ({
                value: option.value ?? "all",
                label: option.label,
              }))}
              value={selectedArea(filters) ?? "all"}
              onSelect={(value) =>
                onChange(areaUpdate(value === "all" ? undefined : (value as LifeArea)))
              }
            />
          </Section>

          {!unreadQueue && (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-3.5 py-3">
              <div>
                <p id="filter-unread-label" className="text-[13px] font-medium text-foreground">
                  Unread only
                </p>
                <p className="text-xs text-muted-foreground">Hide items you have read</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={unreadOnly}
                aria-labelledby="filter-unread-label"
                onClick={() => onChange(UNREAD.toggle(filters))}
                className={cn(
                  "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  unreadOnly ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    unreadOnly ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          )}

          <Section title="Type">
            <ChipGroup
              options={[...TYPE_OPTIONS, { value: "x" as const, label: X_POSTS.label }]}
              selected={typeSelected}
              onToggle={(value) =>
                onChange(
                  value === "x"
                    ? X_POSTS.toggle(filters)
                    : { contentType: toggled(filters.contentTypes, value) }
                )
              }
            />
          </Section>

          <Section title="Priority">
            <ChipGroup
              options={PRIORITY_OPTIONS}
              selected={filters.priorities}
              onToggle={(value) => onChange({ priority: toggled(filters.priorities, value) })}
            />
          </Section>

          <Section title="Source">
            <ChipGroup
              options={SOURCE_OPTIONS}
              selected={filters.sources}
              onToggle={(value) => onChange({ source: toggled(filters.sources, value) })}
            />
          </Section>

          {topicOptions.length > 0 && (
            <Section title="Topic">
              <ChipGroup
                options={topicOptions.map((topic) => ({ value: topic, label: topic }))}
                selected={filters.topics}
                onToggle={(value) => onChange({ topic: toggled(filters.topics, value) })}
              />
            </Section>
          )}

          {!unreadQueue && (
            <Section title="Archive">
              <Segmented
                label="Archive"
                options={ARCHIVE_OPTIONS}
                value={filters.archive}
                onSelect={(archive) =>
                  onChange({ archive: archive === "exclude" ? undefined : archive })
                }
              />
            </Section>
          )}

          <Section title="Date added">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">
                From
                <input
                  type="date"
                  value={filters.dateFrom}
                  max={filters.dateTo || undefined}
                  onChange={(event) =>
                    onChange({
                      dateFrom: event.target.value ? dateQueryValue(event.target.value) : undefined,
                    })
                  }
                  className={dateFieldClass}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                To
                <input
                  type="date"
                  value={filters.dateTo}
                  min={filters.dateFrom || undefined}
                  onChange={(event) =>
                    onChange({
                      dateTo: event.target.value
                        ? dateQueryValue(event.target.value, true)
                        : undefined,
                    })
                  }
                  className={dateFieldClass}
                />
              </label>
            </div>
          </Section>
        </div>

        <SheetFooter className="mt-0 flex-row items-center justify-between gap-3 border-t px-5 py-3">
          <Button
            variant="ghost"
            className="h-9 px-3 text-muted-foreground"
            disabled={activeCount === 0}
            onClick={() => onChange(RESET_SHEET_FILTERS)}
          >
            Reset
          </Button>
          <Button className="h-9 min-w-24 rounded-full" onClick={() => setOpen(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
