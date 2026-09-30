/**
 * Today's Brief — the home screen of Distil.
 *
 * Redesigned as an editorial "morning brief" that reads like a newsletter:
 * greeting + inline stats → priority reading → recent activity.
 *
 * Server Component: the page runs Today's feed read itself (one tenant
 * transaction) so the first HTML already carries the sections; the client
 * component only fetches when no server-side data is available.
 *
 * With a search, an area or another filter in the URL (inline search F5) the
 * same read runs Today's results query instead — unread items only, through
 * the Feed's query contract — and the page renders the results list.
 */

import { TodayExperience, type TodayInitial } from "@/components/phase2/today-experience";
import {
  loadFeedPage,
  parseFeedQuery,
  todayFeedParams,
  type FeedQueryParams,
} from "@/lib/feed/feed-params";
import {
  isTodayFiltered,
  todayFilterState,
  todayResultsSearch,
  todayView,
} from "@/lib/feed/today-selection";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { loadPageData } from "@/lib/server-render/page-data";

type SearchParams = Record<string, string | string[] | undefined>;

async function loadToday(params: SearchParams): Promise<TodayInitial | null> {
  const state = todayFilterState(params);
  let query: FeedQueryParams;
  if (isTodayFiltered(state)) {
    const parsed = parseFeedQuery(todayResultsSearch(state));
    if (!parsed.ok) return null;
    query = parsed.data;
  } else {
    query = todayFeedParams();
  }
  const flags = readPhase2FeatureFlags();
  const loaded = await loadPageData("/", async (repositories) => {
    const [page, collections] = await Promise.all([
      loadFeedPage(repositories, query, { personalization: flags.personalization }),
      repositories.collections.list(),
    ]);
    return { page, collections };
  });
  if (!loaded) return null;
  return {
    ...todayView(state, loaded.page),
    collections: loaded.collections.map(({ id, name }) => ({ id, name })),
  };
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <TodayExperience initial={await loadToday(await searchParams)} />;
}
