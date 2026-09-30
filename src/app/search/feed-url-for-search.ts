/** Old `/search?…` query string → the equivalent `/feed?…` URL; the parameters are shared. */

export type SearchParams = Record<string, string | string[] | undefined>;

const FEED_PARAMETER_NAMES = new Set([
  "read",
  "archive",
  "topic",
  "source",
  "contentType",
  "priority",
  "dateFrom",
  "dateTo",
  "q",
  "site",
  "area",
  "sort",
  "limit",
  "cursor",
  "resurface",
]);

export function feedUrlForSearch(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (!FEED_PARAMETER_NAMES.has(name)) continue;
    for (const entry of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(name, entry);
    }
  }
  const search = query.toString();
  return search ? `/feed?${search}` : "/feed";
}
