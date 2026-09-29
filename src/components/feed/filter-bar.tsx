"use client";

/**
 * The filter bar at the top of the feed (and Today, from F5): search as you
 * type, the life-area switch, one-tap quick filters, and chips for anything
 * set in the Filters sheet. The URL is the only state it changes; the parent
 * owns navigation through `onChange`.
 *
 * Typing reports the draft immediately (`onSearchDraftChange`, for instant
 * filtering of what is already on screen) and commits it to the URL 250 ms
 * after the last keystroke, so one pause is one server request.
 */

import * as React from "react";
import { Search, X } from "lucide-react";

import {
  AREA_OPTIONS,
  CLEAR_ALL_FILTERS,
  QUICK_FILTERS,
  activeSheetFilters,
  areaUpdate,
  hasActiveFilters,
  selectedArea,
  type FilterUpdates,
} from "@/lib/feed/quick-filters";
import { normalizeSearchQuery, type FeedFilterState } from "@/lib/feed/feed-url";
import { cn } from "@/lib/utils";

export const SEARCH_DEBOUNCE_MS = 250;

const rowClass =
  "-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const pillClass = (selected: boolean) =>
  cn(
    "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    selected
      ? "border-primary/30 bg-primary/10 text-primary"
      : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
  );

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export interface FilterBarProps {
  filters: FeedFilterState;
  onChange: (updates: FilterUpdates) => void;
  /** Called on every keystroke with the raw draft, before it reaches the URL. */
  onSearchDraftChange?: (draft: string) => void;
  /** Collection id → name, for the collection chips. */
  collectionNames?: Record<string, string>;
  /** The Filters sheet trigger, rendered beside the search field. */
  sheet?: React.ReactNode;
  placeholder?: string;
}

export function FilterBar({
  filters,
  onChange,
  onSearchDraftChange,
  collectionNames,
  sheet,
  placeholder = "Search your items",
}: FilterBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState(filters.searchQuery);
  const committed = filters.searchQuery;

  // Follow the URL when it changes from elsewhere (Back, Clear, a shared link),
  // but never overwrite text that is still too short to have been sent.
  React.useEffect(() => {
    setDraft((current) => (normalizeSearchQuery(current) === committed ? current : committed));
  }, [committed]);

  // Latest callbacks without re-arming the debounce on every parent render.
  const onChangeRef = React.useRef(onChange);
  const onDraftRef = React.useRef(onSearchDraftChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
    onDraftRef.current = onSearchDraftChange;
  });

  React.useEffect(() => {
    onDraftRef.current?.(draft);
    const next = normalizeSearchQuery(draft);
    if (next === committed) return;
    const timer = setTimeout(
      () => onChangeRef.current({ q: next || undefined }),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [draft, committed]);

  // "/" focuses the search from anywhere on the page that is not a text field.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const clearSearch = () => {
    setDraft("");
    if (committed) onChange({ q: undefined });
  };

  const area = selectedArea(filters);
  const chips = activeSheetFilters(filters, collectionNames);
  const anyActive = hasActiveFilters(filters);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div role="search" className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (draft) clearSearch();
                else inputRef.current?.blur();
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            enterKeyHint="search"
            autoComplete="off"
            className="h-10 w-full rounded-lg border bg-card pl-9 pr-16 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {draft ? (
            <button
              type="button"
              onClick={() => {
                clearSearch();
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground sm:block"
            >
              /
            </kbd>
          )}
        </div>
        {sheet}
      </div>

      <div
        role="radiogroup"
        aria-label="Area"
        className={cn(rowClass, "rounded-lg bg-muted/60 p-1")}
      >
        {AREA_OPTIONS.map((option) => {
          const checked = option.value === area;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                if (!checked) onChange(areaUpdate(option.value));
              }}
              className={cn(
                "min-h-8 flex-1 shrink-0 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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

      <div className={rowClass} role="group" aria-label="Quick filters">
        {QUICK_FILTERS.map((filter) => {
          const active = filter.isActive(filters);
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(filter.toggle(filters))}
              className={pillClass(active)}
            >
              {filter.label}
            </button>
          );
        })}
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(chip.remove)}
            aria-label={`Remove filter: ${chip.label}`}
            className={pillClass(true)}
          >
            {chip.label}
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ))}
        {anyActive && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onChange(CLEAR_ALL_FILTERS);
            }}
            className="min-h-9 shrink-0 px-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
