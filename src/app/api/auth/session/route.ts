import { readAuthEnvironment } from "@/lib/auth/environment";
import { readSessionCookie } from "@/lib/auth/request";
import { verifySessionToken } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  const environment = readAuthEnvironment();
  const authenticated = await verifySessionToken(
    readSessionCookie(request),
    environment.sessionSecret
  );
  return Response.json({ authenticated });
}
