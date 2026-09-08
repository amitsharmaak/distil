import { resolveCurrentAccount } from "@/lib/auth/account-service";
import { neonSessionProvider, listAuthDevices } from "@/lib/auth/devices";
import { authFailureResponse } from "@/lib/auth/http";
import { getNeonAuthServer } from "@/lib/auth/neon-server";

export async function GET(request: Request): Promise<Response> {
  try {
    const resolved = await resolveCurrentAccount(request);
    return Response.json(
      {
        sessions: await listAuthDevices(
          neonSessionProvider(getNeonAuthServer()),
          resolved.identity.sessionId
        ),
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    return authFailureResponse(error);
  }
}
