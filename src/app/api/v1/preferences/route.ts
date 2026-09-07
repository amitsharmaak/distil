import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { digestErrorResponse, parse, readJson } from "@/lib/digests/http";
import { preferencesUpdateSchema } from "@/lib/digests/service";
import { createPostgresClient } from "@/lib/postgres/client";

function unavailable(): Response | undefined {
  return process.env.DATABASE_URL
    ? undefined
    : Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Preferences require PostgreSQL" } },
        { status: 503 }
      );
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    const missing = unavailable();
    if (missing) return missing;
    const sql = createPostgresClient();
    try {
      return Response.json({ preferences: await new PostgresDigestStore(sql).getPreferences() });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    return digestErrorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const input = parse(await readJson(request), preferencesUpdateSchema);
    const missing = unavailable();
    if (missing) return missing;
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
