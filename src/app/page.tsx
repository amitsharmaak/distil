/**
 * Today's Brief — the home screen of Distil.
 *
 * Redesigned as an editorial "morning brief" that reads like a newsletter:
 * greeting + inline stats → priority reading → recent activity.
 *
 * Server Component: the page runs Today's feed read itself (one tenant
 * transaction) so the first HTML already carries the sections; the client
 * component only fetches when no server-side data is available.
 */

import { TodayExperience } from "@/components/phase2/today-experience";
import { loadFeedPage } from "@/lib/feed/feed-params";
import { todayFeedParams, todaySections, type TodaySections } from "@/lib/feed/today-selection";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { loadPageData } from "@/lib/server-render/page-data";

async function loadTodaySections(): Promise<TodaySections | null> {
  const flags = readPhase2FeatureFlags();
  const page = await loadPageData("/", (repositories) =>
    loadFeedPage(repositories, todayFeedParams(), { personalization: flags.personalization })
  );
  return page ? todaySections(page) : null;
}

export default async function TodayPage() {
  return <TodayExperience initial={await loadTodaySections()} />;
}
