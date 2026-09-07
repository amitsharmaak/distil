import { z } from "zod";

import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession } from "@/lib/auth/route-helpers";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { digestErrorResponse, parse } from "@/lib/digests/http";
import { createPostgresClient } from "@/lib/postgres/client";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

const querySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(90).default(30) })
  .strict();

export async function GET(request: Request): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    const input = parse(
      { limit: new URL(request.url).searchParams.get("limit") ?? undefined },
      querySchema
    );
    if (!readPhase2FeatureFlags().digests) {
      return Response.json(
        { error: { code: "FEATURE_DISABLED", message: "In-app digests are not enabled" } },
        { status: 503 }
      );
    }
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Digests require PostgreSQL" } },
        { status: 503 }
      );
    }
    const sql = createPostgresClient();
    try {
      return Response.json({
        digests: await new PostgresDigestStore(sql).listDigests(input.limit),
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    return digestErrorResponse(error);
  }
}
