import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { digestErrorResponse, parse, readJson } from "@/lib/digests/http";
import { preferencesUpdateSchema } from "@/lib/digests/service";

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
    const context = await resolveRequestAuthContext(request);
    const missing = unavailable();
    if (missing) return missing;
    return Response.json({
      preferences: await (await getTenantRepositories(context)).digestExperience.getPreferences(),
    });
  } catch (error) {
    return digestErrorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const input = parse(await readJson(request), preferencesUpdateSchema);
    const missing = unavailable();
    if (missing) return missing;
    return Response.json({
      preferences: await (
        await getTenantRepositories(context)
      ).digestExperience.updatePreferences(input),
    });
  } catch (error) {
    return digestErrorResponse(error);
  }
}
