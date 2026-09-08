import { z } from "zod";

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { getTenantRepositories } from "@/lib/database";
import { KnowledgeServiceError } from "@/lib/knowledge/service";
import { knowledgeErrorResponse } from "@/lib/knowledge/http";
import { searchPassages } from "@/lib/knowledge/retrieval";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

const schema = z.object({
  q: z.string().trim().min(2).max(2_000),
  read: z.enum(["true", "false"]).optional(),
  archive: z.enum(["exclude", "only", "include"]).optional(),
  topics: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
  sources: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  contentTypes: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  priorities: z
    .array(z.enum(["high", "medium", "low"]))
    .max(3)
    .optional(),
  collectionIds: z.array(z.string().trim().min(1).max(160)).max(25).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const allowed = new Set([
  "q",
  "read",
  "archive",
  "topic",
  "source",
  "contentType",
  "priority",
  "collection",
  "dateFrom",
  "dateTo",
  "limit",
]);

function multi(params: URLSearchParams, key: string): string[] | undefined {
  const values = params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveRequestAuthContext(request);
    if (!readPhase2FeatureFlags().search) {
      return Response.json(
        { error: { code: "FEATURE_DISABLED", message: "Knowledge search is not enabled" } },
        { status: 503 }
      );
    }
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Knowledge search requires PostgreSQL" } },
        { status: 503 }
      );
    }
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => !allowed.has(key))) {
      throw new KnowledgeServiceError("INVALID_REQUEST", 400, "Unknown search parameter");
    }
    const parsed = schema.safeParse({
      q: params.get("q") ?? undefined,
      read: params.get("read") ?? undefined,
      archive: params.get("archive") ?? undefined,
      topics: multi(params, "topic"),
      sources: multi(params, "source"),
      contentTypes: multi(params, "contentType"),
      priorities: multi(params, "priority"),
      collectionIds: multi(params, "collection"),
      dateFrom: params.get("dateFrom") ?? undefined,
      dateTo: params.get("dateTo") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      throw new KnowledgeServiceError(
        "INVALID_REQUEST",
        400,
        parsed.error.issues[0]?.message ?? "Invalid search query"
      );
    }
    if (parsed.data.dateFrom && parsed.data.dateTo && parsed.data.dateFrom > parsed.data.dateTo) {
      throw new KnowledgeServiceError("INVALID_REQUEST", 400, "dateFrom must not be after dateTo");
    }
    const repositories = await getTenantRepositories(context);
    return Response.json(
      await searchPassages(repositories.passages, {
        query: parsed.data.q,
        read: parsed.data.read === undefined ? undefined : parsed.data.read === "true",
        archive: parsed.data.archive,
        topics: parsed.data.topics,
        sources: parsed.data.sources,
        contentTypes: parsed.data.contentTypes,
        priorities: parsed.data.priorities,
        collectionIds: parsed.data.collectionIds,
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        limit: parsed.data.limit,
      })
    );
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
