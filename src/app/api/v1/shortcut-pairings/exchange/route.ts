import { AuthError, errorResponse } from "@/lib/auth/errors";
import { exchangePairingCode } from "@/lib/auth/shortcut-pairing";
import { enforceShortcutPairingRateLimit } from "@/lib/auth/shortcut-pairing-rate-limit";
import { requestIdSchema } from "@/lib/contracts";
import { getShortcutPairingIdentityResolver, getTenantRepositories } from "@/lib/database";

function unauthorized(): AuthError {
  return new AuthError("UNAUTHORIZED", 401, "Authentication required");
}

/** The one-time code is the credential; neither a session nor Origin is required. */
export async function POST(request: Request): Promise<Response> {
  try {
    // Charge every attempt before parsing or resolving a code, even if a
    // browser session accompanies it or the body cannot possibly be valid.
    await enforceShortcutPairingRateLimit(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw unauthorized();
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw unauthorized();
    const input = body as { code?: unknown; deviceName?: unknown };
    const trace = requestIdSchema.safeParse(request.headers.get("x-trace-id"));
    const result = await exchangePairingCode(
      { code: input.code, deviceName: input.deviceName },
      {
        pairingIdentities: await getShortcutPairingIdentityResolver(),
        getTenantRepositories,
      },
      { requestId: trace.success ? trace.data : requestIdSchema.parse(crypto.randomUUID()) }
    );
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    // Never distinguish malformed, unknown, expired or previously consumed codes.
    const response = errorResponse(
      error instanceof AuthError && error.code === "UNAUTHORIZED" ? unauthorized() : error
    );
    response.headers.set("cache-control", "private, no-store");
    return response;
  }
}
