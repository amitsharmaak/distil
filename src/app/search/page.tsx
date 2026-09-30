/**
 * The old Search page. Search now lives in the Feed header and uses the same
 * URL parameters (`q`, `source`, `contentType`, `priority`, `topic`, `read`,
 * `archive`, `dateFrom`, `dateTo`), so old `/search?…` links and bookmarks
 * land on the equivalent Feed view. Retired parameters are silently discarded.
 */

import { redirect } from "next/navigation";

import { feedUrlForSearch, type SearchParams } from "./feed-url-for-search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirect(feedUrlForSearch(await searchParams));
}
