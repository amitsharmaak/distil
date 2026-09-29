/**
 * The filter bar's vocabulary, shared by every page that shows it (Feed now,
 * Today in F5): the search stays in the bar, every filter sits in the Filters
 * sheet, and the bar shows what is active as removable chips. Each entry maps to URL parameters, so the URL stays the single
 * source of truth and a filtered view can be shared or restored with Back.
 *
 * Client-safe: no zod or other server-only imports.
 */

import type { FeedFilterState } from "@/lib/feed/feed-url";
import { LIFE_AREAS, type LifeArea, type Priority } from "@/lib/types";

/** URL parameter changes; `undefined` removes the parameter. */
export type FilterUpdates = Record<string, string | string[] | undefined>;

export const AREA_LABELS: Record<LifeArea, string> = {
  personal: "Personal",
  work: "Work",
  learning: "Learning",
  updates: "Updates",
};

/** The area switch: "All" plus the four areas, one selected at a time. */
export const AREA_OPTIONS: Array<{ value: LifeArea | undefined; label: string }> = [
  { value: undefined, label: "All" },
  ...LIFE_AREAS.map((area) => ({ value: area, label: AREA_LABELS[area] })),
];

export function areaUpdate(area: LifeArea | undefined): FilterUpdates {
  return { area: area ?? undefined };
}

/** The selected area when exactly one is in the URL; the switch shows "All" otherwise. */
export function selectedArea(state: FeedFilterState): LifeArea | undefined {
  return state.areas.length === 1 ? state.areas[0] : undefined;
}

function toggled<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export const X_SITE = "x.com";

export interface QuickFilter {
  id: "unread" | "x";
  label: string;
  isActive(state: FeedFilterState): boolean;
  toggle(state: FeedFilterState): FilterUpdates;
}

/**
 * The toggles in the Filters sheet's "Show" group that no facet group already
 * offers (priority, type and source have their own groups there).
 */
export const QUICK_FILTERS: QuickFilter[] = [
  {
    id: "unread",
    label: "Unread only",
    isActive: (state) => !state.showRead,
    toggle: (state) => ({ read: state.showRead ? "false" : "true", showRead: undefined }),
  },
  {
    id: "x",
    label: "X posts",
    isActive: (state) => state.sites.includes(X_SITE),
    toggle: (state) => ({ site: toggled(state.sites, X_SITE) }),
  },
];

const SOURCE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  slack: "Slack",
  "browser-extension": "Extension",
  manual: "Manual",
  publisher: "Publisher",
};
const CONTENT_TYPE_LABELS: Record<string, string> = {
  article: "Articles",
  video: "Videos",
  podcast: "Podcasts",
};
const ARCHIVE_LABELS = { include: "Including archived", only: "Archived only" } as const;
const PRIORITY_LABELS: Record<Priority, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority",
};

export interface ActiveFilterChip {
  key: string;
  label: string;
  remove: FilterUpdates;
}

/**
 * Every filter that narrows the list beyond the default unread view, each
 * with the update that removes it. All filters live in the Filters sheet, so
 * the bar shows these as removable chips and nothing is ever active silently.
 */
export function activeFilterChips(
  state: FeedFilterState,
  collectionNames: Record<string, string> = {}
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  for (const area of state.areas) {
    chips.push({
      key: `area:${area}`,
      label: AREA_LABELS[area] ?? area,
      remove: { area: state.areas.filter((entry) => entry !== area) },
    });
  }
  if (state.showRead) {
    chips.push({
      key: "read",
      label: "Read included",
      remove: { read: undefined, showRead: undefined },
    });
  }
  for (const priority of state.priorities) {
    chips.push({
      key: `priority:${priority}`,
      label: PRIORITY_LABELS[priority] ?? priority,
      remove: { priority: state.priorities.filter((entry) => entry !== priority) },
    });
  }
  for (const type of state.contentTypes) {
    chips.push({
      key: `contentType:${type}`,
      label: CONTENT_TYPE_LABELS[type] ?? type,
      remove: { contentType: state.contentTypes.filter((entry) => entry !== type) },
    });
  }
  for (const site of state.sites) {
    chips.push({
      key: `site:${site}`,
      label: site === X_SITE ? "X posts" : site,
      remove: { site: state.sites.filter((entry) => entry !== site) },
    });
  }
  for (const source of state.sources) {
    chips.push({
      key: `source:${source}`,
      label: SOURCE_LABELS[source] ?? source,
      remove: { source: state.sources.filter((entry) => entry !== source) },
    });
  }
  for (const topic of state.topics) {
    chips.push({
      key: `topic:${topic}`,
      label: topic,
      remove: { topic: state.topics.filter((entry) => entry !== topic) },
    });
  }
  for (const collection of state.collections) {
    chips.push({
      key: `collection:${collection}`,
      label: collectionNames[collection] ?? "Collection",
      remove: { collection: state.collections.filter((entry) => entry !== collection) },
    });
  }
  if (state.archive !== "exclude") {
    chips.push({
      key: "archive",
      label: ARCHIVE_LABELS[state.archive],
      remove: { archive: undefined },
    });
  }
  if (state.dateFrom) {
    chips.push({
      key: "dateFrom",
      label: `From ${state.dateFrom}`,
      remove: { dateFrom: undefined },
    });
  }
  if (state.dateTo) {
    chips.push({ key: "dateTo", label: `To ${state.dateTo}`, remove: { dateTo: undefined } });
  }
  return chips;
}

/** True when anything narrows the list beyond the default unread view. */
export function hasActiveFilters(state: FeedFilterState): boolean {
  return Boolean(state.searchQuery) || activeFilterChips(state).length > 0;
}

/** Removes every filter and the search, back to the default unread view; sort and layout stay. */
export const CLEAR_ALL_FILTERS: FilterUpdates = {
  q: undefined,
  area: undefined,
  read: undefined,
  showRead: undefined,
  priority: undefined,
  contentType: undefined,
  site: undefined,
  source: undefined,
  topic: undefined,
  collection: undefined,
  archive: undefined,
  dateFrom: undefined,
  dateTo: undefined,
};

/** The Filters sheet's Reset: every filter back to default, but the search stays. */
export const RESET_SHEET_FILTERS: FilterUpdates = Object.fromEntries(
  Object.entries(CLEAR_ALL_FILTERS).filter(([name]) => name !== "q")
);
