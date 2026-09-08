import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { digestErrorResponse } from "@/lib/digests/http";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Preferences require PostgreSQL" } },
        { status: 503 }
      );
    }
    return Response.json({
      preferences: await (await getTenantRepositories(context)).digestExperience.resetPreferences(),
    });
  } catch (error) {
    return digestErrorResponse(error);
  }
}
