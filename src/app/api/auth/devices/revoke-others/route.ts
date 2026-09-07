import { resolveCurrentAccount } from "@/lib/auth/account-service";
import { neonSessionProvider, revokeOtherAuthDevices } from "@/lib/auth/devices";
import { authFailureResponse } from "@/lib/auth/http";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireFreshAuthentication } from "@/lib/auth/request-context";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const resolved = await resolveCurrentAccount(request);
    requireFreshAuthentication(resolved.freshAuth);
    return Response.json({
      revoked: await revokeOtherAuthDevices(neonSessionProvider(getNeonAuthServer())),
    });
  } catch (error) {
    return authFailureResponse(error);
  }
}
