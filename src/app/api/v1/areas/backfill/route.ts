import { readAuthEnvironment } from "@/lib/auth/environment";
import { config } from "@/lib/config";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import {
  getAreaBackfillOverview,
  startAreaBackfill,
  startAreaBackfillSchema,
} from "@/lib/jobs/area-backfill";
import { withRequestMetrics } from "@/lib/observability/request-metrics";
import { readerErrorResponse } from "@/lib/phase2/reader-http";
import { resolveTenantJobDispatcher } from "@/lib/queue/tenant-job-dispatch";

const noStore = { "cache-control": "no-store" };

function postgresRequired(): Response | undefined {
  if (config.databaseUrl) return undefined;
  return Response.json(
    { error: { code: "POSTGRES_REQUIRED", message: "The area backfill requires PostgreSQL" } },
    { status: 503 }
  );
}

/**
 * Starts a life-area backfill for the signed-in user's own items (phase F6).
 * The work runs as chained tenant jobs on the account-lifecycle queue; this
 * request only enqueues the first batch. Body (optional): `{batchSize, maxBatches}`.
 */
export const POST = withRequestMetrics(async (request: Request): Promise<Response> => {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const unavailable = postgresRequired();
    if (unavailable) return unavailable;
    const text = await request.text();
    let body: unknown = {};
    try {
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      body = undefined;
    }
    const input = startAreaBackfillSchema.safeParse(body);
    if (!input.success) {
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Body must be empty or {batchSize?: 1-50, maxBatches?: 1-1000}",
          },
        },
        { status: 400 }
      );
    }
    const result = await startAreaBackfill(context, await getTenantRepositories(context), {
      ...input.data,
      dispatcher: await resolveTenantJobDispatcher(),
    });
    return Response.json(result, { status: result.started ? 202 : 200, headers: noStore });
  } catch (error) {
    return readerErrorResponse(error);
  }
});

/** Area counts for the signed-in user's items and their recent backfill runs. Counts only. */
export const GET = withRequestMetrics(async (request: Request): Promise<Response> => {
  try {
    const context = await resolveRequestAuthContext(request);
    const unavailable = postgresRequired();
    if (unavailable) return unavailable;
    const overview = await getAreaBackfillOverview(await getTenantRepositories(context));
    return Response.json(overview, { headers: noStore });
  } catch (error) {
    return readerErrorResponse(error);
  }
});
