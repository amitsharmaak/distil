import { resolveCurrentAccount } from "@/lib/auth/account-service";
import { neonSessionProvider, revokeAuthDevice } from "@/lib/auth/devices";
import { authFailureResponse } from "@/lib/auth/http";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireFreshAuthentication } from "@/lib/auth/request-context";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const resolved = await resolveCurrentAccount(request);
    requireFreshAuthentication(resolved.freshAuth);
    const revoked = await revokeAuthDevice(
      neonSessionProvider(getNeonAuthServer()),
      (await params).id,
      resolved.identity.sessionId
    );
    return Response.json({ revoked }, { status: revoked ? 200 : 404 });
  } catch (error) {
    return authFailureResponse(error);
  }
}
