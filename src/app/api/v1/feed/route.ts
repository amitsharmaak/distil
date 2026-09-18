import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { loadFeedPage, parseFeedQuery } from "@/lib/feed/feed-params";
import { FeedQueryError } from "@/lib/feed/feed-query";
import { withTenantRepositories } from "@/lib/database";
import { apiLogger } from "@/lib/logger";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { withRequestMetrics } from "@/lib/observability/request-metrics";

export const GET = withRequestMetrics(async (request: Request): Promise<Response> => {
  try {
    const context = await resolveRequestAuthContext(request);
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Phase 2 feed requires PostgreSQL" } },
        { status: 503 }
      );
    }

    const parsed = parseFeedQuery(new URL(request.url).searchParams);
    if (!parsed.ok) {
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: parsed.message,
            ...(parsed.issues ? { details: parsed.issues } : {}),
          },
        },
        { status: 400 }
      );
    }

    const flags = readPhase2FeatureFlags();
    // One tenant transaction for the whole read: the preferences lookup (when
    // personalization is on), the feed page and any resurfacing strip share
    // the verified context. The server-rendered /feed page runs the same read.
    const page = await withTenantRepositories(context, (repositories) =>
      loadFeedPage(repositories, parsed.data, { personalization: flags.personalization })
    );
    return Response.json(page);
  } catch (error) {
    if (error instanceof FeedQueryError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 }
      );
    }
    if (
      error instanceof Error &&
      "status" in error &&
      (error as { status?: number }).status === 401
    ) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    apiLogger.error({ err: error }, "GET /api/v1/feed failed");
    return Response.json(
      { error: { code: "PROCESSING_FAILED", message: "Unable to load feed" } },
      { status: 500 }
    );
  }
});
