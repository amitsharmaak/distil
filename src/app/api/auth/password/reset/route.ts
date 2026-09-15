import { readApplicationOrigin } from "@/lib/auth/app-origin";
import { createPasswordResetHandler, neonPasswordProvider } from "@/lib/auth/password-login";
import { getNeonAuthServer } from "@/lib/auth/neon-server";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = getNeonAuthServer();
    const appOrigin = readApplicationOrigin();
    return createPasswordResetHandler({
      provider: neonPasswordProvider(auth, appOrigin),
      appOrigin,
    })(request);
  } catch {
    return Response.json(
      { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
      { status: 503 }
    );
  }
}
