import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { digestErrorResponse, parse, readJson } from "@/lib/digests/http";
import { digestPreferencesSchema } from "@/lib/digests/service";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export async function PATCH(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
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
    return Response.json({
      preferences: await (
        await getTenantRepositories(context)
      ).digestExperience.updatePreferences(input),
    });
  } catch (error) {
    return digestErrorResponse(error);
  }
}
