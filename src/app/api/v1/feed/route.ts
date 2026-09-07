import { z } from "zod";

import { requireRequestSession } from "@/lib/auth/route-helpers";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { FeedQueryError, PostgresFeedQuery } from "@/lib/feed/feed-query";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { apiLogger } from "@/lib/logger";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { createPostgresClient } from "@/lib/postgres/client";

const querySchema = z.object({
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
});

function multi(searchParams: URLSearchParams, name: string): string[] | undefined {
  const values = searchParams
    .getAll(name)
    .flatMap((value) => value.split(","))
    .filter(Boolean);
  return values.length ? values : undefined;
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Phase 2 feed requires PostgreSQL" } },
        { status: 503 }
      );
    }

    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      read: params.get("read") ?? undefined,
      archive: params.get("archive") ?? undefined,
      topic: multi(params, "topic"),
      source: multi(params, "source"),
      contentType: multi(params, "contentType"),
      priority: multi(params, "priority"),
      collection: multi(params, "collection"),
      dateFrom: params.get("dateFrom") ?? undefined,
      dateTo: params.get("dateTo") ?? undefined,
      sort: params.get("sort") ?? undefined,
      limit: params.get("limit") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid feed query",
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }
    if (parsed.data.dateFrom && parsed.data.dateTo && parsed.data.dateFrom > parsed.data.dateTo) {
      return Response.json(
        { error: { code: "INVALID_REQUEST", message: "dateFrom must not be after dateTo" } },
        { status: 400 }
      );
    }

    const sql = createPostgresClient();
    try {
      const flags = readPhase2FeatureFlags();
      const preferences = flags.personalization
        ? await new PostgresDigestStore(sql).getPreferences()
        : undefined;
      const page = await new PostgresFeedQuery(sql).list({
        read: parsed.data.read === undefined ? undefined : parsed.data.read === "true",
        archive: parsed.data.archive,
        topics: parsed.data.topic,
        sources: parsed.data.source,
        contentTypes: parsed.data.contentType,
        priorities: parsed.data.priority,
        collectionIds: parsed.data.collection,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        sort: parsed.data.sort,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
        personalizationEnabled: Boolean(
          flags.personalization && preferences?.personalizationEnabled
        ),
      });
      return Response.json(page);
    } finally {
      await sql.end({ timeout: 5 });
    }
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
}
