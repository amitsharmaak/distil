import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { digestErrorResponse, parse, readJson } from "@/lib/digests/http";
import { digestPreferencesSchema } from "@/lib/digests/service";
import { createPostgresClient } from "@/lib/postgres/client";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export async function PATCH(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const input = parse(await readJson(request), digestPreferencesSchema);
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
        preferences: await new PostgresDigestStore(sql).updatePreferences(input),
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    return digestErrorResponse(error);
  }
}
