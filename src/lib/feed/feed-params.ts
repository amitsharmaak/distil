import { z } from "zod";

import type { FeedPage, FeedQuery } from "@/lib/feed/feed-query";
import type { RepositorySet } from "@/lib/repositories/ports";

import { multiValue, toSearchParams, type FeedSearchInput } from "./feed-url";
import { TODAY_FEED_QUERY } from "./today-selection";

/**
 * The one feed query contract. `GET /api/v1/feed` and the server-rendered
 * `/feed` page parse the same search parameters through this schema, so a
 * URL the page renders on the server is exactly the URL the client island
 * re-requests when it pages or polls.
 */
export const feedQuerySchema = z.object({
  read: z.enum(["true", "false"]).optional(),
  archive: z.enum(["exclude", "only", "include"]).optional(),
  topic: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
  source: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  contentType: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  priority: z
    .array(z.enum(["high", "medium", "low"]))
    .max(3)
    .optional(),
  collection: z.array(z.string().trim().min(1).max(160)).max(25).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  sort: z.enum(["recent", "priority", "for_you"]).default("for_you"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(1024).optional(),
  resurface: z.enum(["stale"]).optional(),
});

export type FeedQueryParams = z.infer<typeof feedQuerySchema>;

/** Today's fixed selection, parsed through the same schema the API applies. */
export function todayFeedParams(): FeedQueryParams {
  return feedQuerySchema.parse(TODAY_FEED_QUERY);
}

export type ParsedFeedQuery =
  | { ok: true; data: FeedQueryParams }
  | { ok: false; message: string; issues?: z.ZodIssue[] };

export function parseFeedQuery(input: FeedSearchInput): ParsedFeedQuery {
  const params = toSearchParams(input);
  const optional = (name: string) => params.get(name) ?? undefined;
  const list = (name: string) => {
    const values = multiValue(params, name);
    return values.length ? values : undefined;
  };
  const parsed = feedQuerySchema.safeParse({
    read: optional("read"),
    archive: optional("archive"),
    topic: list("topic"),
    source: list("source"),
    contentType: list("contentType"),
    priority: list("priority"),
    collection: list("collection"),
    dateFrom: optional("dateFrom"),
    dateTo: optional("dateTo"),
    sort: optional("sort"),
    limit: optional("limit"),
    cursor: optional("cursor"),
    resurface: optional("resurface"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Invalid feed query", issues: parsed.error.issues };
  }
  if (parsed.data.dateFrom && parsed.data.dateTo && parsed.data.dateFrom > parsed.data.dateTo) {
    return { ok: false, message: "dateFrom must not be after dateTo" };
  }
  return { ok: true, data: parsed.data };
}

/** The `feed.list()` arguments for a parsed query; personalization is server-gated. */
export function feedListQuery(
  data: FeedQueryParams,
  personalizationEnabled: boolean
): Omit<FeedQuery, "now"> {
  return {
    read: data.read === undefined ? undefined : data.read === "true",
    archive: data.archive,
    topics: data.topic,
    sources: data.source,
    contentTypes: data.contentType,
    priorities: data.priority,
    collectionIds: data.collection,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    sort: data.sort,
    limit: data.limit,
    cursor: data.cursor,
    personalizationEnabled,
  };
}

export type FeedPageWithResurfacing = FeedPage & { resurfacedItems?: FeedPage["items"] };

/**
 * Runs one feed read exactly as the API route does: the preferences lookup
 * (when personalization is on), the page, and the optional stale-resurfacing
 * strip, all on the repository set the caller has already bound to one tenant
 * transaction.
 */
export async function loadFeedPage(
  repositories: Pick<RepositorySet, "feed" | "digestExperience">,
  data: FeedQueryParams,
  options: { personalization: boolean }
): Promise<FeedPageWithResurfacing> {
  const preferences = options.personalization
    ? await repositories.digestExperience.getPreferences()
    : undefined;
  const page = await repositories.feed.list(
    feedListQuery(data, Boolean(options.personalization && preferences?.personalizationEnabled))
  );
  if (data.resurface !== "stale") return page;
  const resurfaced = await repositories.feed.list({
    read: false,
    archive: "exclude",
    sort: "recent",
    limit: 3,
    resurface: "stale",
    personalizationEnabled: false,
  });
  return { ...page, resurfacedItems: resurfaced.items };
}

export {
  dateQueryValue,
  feedFilterKey,
  feedFilterState,
  feedRequestSearch,
  multiValue,
  type FeedFilterState,
  type FeedSearchInput,
} from "./feed-url";
