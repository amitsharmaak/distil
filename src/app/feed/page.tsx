/**
 * Feed page — server-rendered with its first page of data.
 *
 * The first HTML already contains the items: the page parses the URL through
 * the same schema as `GET /api/v1/feed`, loads that page in one tenant
 * transaction, and hands it to the `FeedList` client island. Same-page filter
 * changes update native history and read the account cache; load-more and the
 * processing-status poll stay in the island against the API. Search (`?q=`)
 * renders on the server like any other filter;
 * an environment without a server-side user renders the island without data,
 * which then fetches as before.
 */

import { FeedList, type FeedInitialPage } from "@/components/feed/feed-list";
import {
  feedFilterKey,
  feedFilterState,
  feedRequestSearch,
  loadFeedPage,
  parseFeedQuery,
} from "@/lib/feed/feed-params";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { loadPageData } from "@/lib/server-render/page-data";

type SearchParams = Record<string, string | string[] | undefined>;
type TimedInitialPage = { page: FeedInitialPage | null; updatedAt?: number };

async function loadInitialPage(params: SearchParams): Promise<TimedInitialPage> {
  const state = feedFilterState(params);
  // Parse exactly the request the island would send for this URL, so the
  // server page and its key always describe the same query (search included).
  const parsed = parseFeedQuery(feedRequestSearch(state, state.cursor));
  if (!parsed.ok) return { page: null };
  const flags = readPhase2FeatureFlags();
  const loaded = await loadPageData("/feed", (repositories) =>
    loadFeedPage(repositories, parsed.data, { personalization: flags.personalization })
  );
  if (!loaded) return { page: null };
  return {
    page: {
      key: feedFilterKey(state),
      items: loaded.items,
      nextCursor: loaded.nextCursor,
    },
    updatedAt: Date.now(),
  };
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const initial = await loadInitialPage(params);
  return <FeedList initialPage={initial.page} initialDataUpdatedAt={initial.updatedAt} />;
}
