import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { digestErrorResponse } from "@/lib/digests/http";
import { createPostgresClient } from "@/lib/postgres/client";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Preferences require PostgreSQL" } },
        { status: 503 }
      );
    }
    const sql = createPostgresClient();
    try {
      return Response.json({ preferences: await new PostgresDigestStore(sql).resetPreferences() });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    return digestErrorResponse(error);
  }
}
