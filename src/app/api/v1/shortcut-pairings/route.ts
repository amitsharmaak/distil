import { AccessDeniedError } from "@/lib/auth/account";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { errorResponse } from "@/lib/auth/errors";
import { authFailureResponse } from "@/lib/auth/http";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { createPairingCode } from "@/lib/auth/shortcut-pairing";
import { getTenantRepositories } from "@/lib/database";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const repositories = await getTenantRepositories(context);
    const pairing = await createPairingCode(context, repositories.shortcutPairings);
    return Response.json(pairing, {
      status: 201,
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const response =
      error instanceof AccessDeniedError ? authFailureResponse(error) : errorResponse(error);
    response.headers.set("cache-control", "private, no-store");
    return response;
  }
}
