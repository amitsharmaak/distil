"use client";

/**
 * The filter bar at the top of the feed (and Today, from F5): a compact search
 * beside the page title, the Filters sheet trigger, and a row of removable
 * chips for whatever filters are active. Every filter itself lives in the
 * sheet (`FeedFilterSheet`). The URL is the only state it changes; the parent
 * owns navigation through `onChange`.
 *
 * Typing reports the draft immediately (`onSearchDraftChange`, for instant
 * filtering of what is already on screen) and commits it to the URL 250 ms
 * after the last keystroke, so one pause is one server request.
 */

import * as React from "react";
import { Search, X } from "lucide-react";

import {
  CLEAR_ALL_FILTERS,
  activeFilterChips,
  hasActiveFilters,
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
  /** Rendered at the start of the search row, typically the page title. */
  leading?: React.ReactNode;
  placeholder?: string;
  label?: string;
}

export function FilterBar({
  filters,
  onChange,
  onSearchDraftChange,
  collectionNames,
  sheet,
  leading,
  placeholder = "Search",
  label = "Search your items",
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

  const chips = activeFilterChips(filters, collectionNames);
  const anyActive = hasActiveFilters(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {leading}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div
            role="search"
            className="relative min-w-0 flex-1 sm:w-56 sm:flex-none sm:transition-[width] sm:duration-200 sm:focus-within:w-72"
          >
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
              aria-label={label}
              enterKeyHint="search"
              autoComplete="off"
              className="h-9 w-full rounded-full border border-transparent bg-muted/60 pl-9 pr-10 text-base text-foreground transition-colors placeholder:text-muted-foreground hover:bg-muted focus-visible:border-border focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {draft ? (
              <button
                type="button"
                onClick={() => {
                  clearSearch();
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border bg-card px-1.5 font-mono text-[11px] leading-4 text-muted-foreground sm:block"
              >
                /
              </kbd>
            )}
          </div>
          {sheet}
        </div>
      </div>

      {chips.length > 0 && (
        <div className={rowClass} role="group" aria-label="Active filters">
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
      )}
    </div>
  );
}
