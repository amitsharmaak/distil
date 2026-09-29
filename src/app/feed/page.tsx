/**
 * Feed page — server-rendered with its first page of data.
 *
 * The first HTML already contains the items: the page parses the URL through
 * the same schema as `GET /api/v1/feed`, runs one tenant transaction for the
 * feed page and the collection names, and hands both to the `FeedList` client
 * island. Filter changes are `router.replace` navigations (the server renders
 * the new page); load-more and the processing-status poll stay in the island
 * against the API. Search (`?q=`) renders on the server like any other filter;
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

async function loadInitialPage(params: SearchParams): Promise<FeedInitialPage | null> {
  const state = feedFilterState(params);
  // Parse exactly the request the island would send for this URL, so the
  // server page and its key always describe the same query (search included).
  const parsed = parseFeedQuery(feedRequestSearch(state, state.cursor));
  if (!parsed.ok) return null;
  const flags = readPhase2FeatureFlags();
  const loaded = await loadPageData("/feed", async (repositories) => {
    const [page, collections] = await Promise.all([
      loadFeedPage(repositories, parsed.data, { personalization: flags.personalization }),
      repositories.collections.list(),
    ]);
    return { page, collections };
  });
  if (!loaded) return null;
  return {
    key: feedFilterKey(state),
    items: loaded.page.items,
    nextCursor: loaded.page.nextCursor,
    collections: loaded.collections.map(({ id, name }) => ({ id, name })),
  };
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const initialPage = await loadInitialPage(params);
  return <FeedList initialPage={initialPage} />;
}
