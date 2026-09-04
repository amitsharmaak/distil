import { readAuthEnvironment, type AuthEnvironment } from "@/lib/auth/environment";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readSessionCookie } from "@/lib/auth/request";
import { requireSession } from "@/lib/auth/service";

export async function requireRequestSession(
  request: Request,
  environment: AuthEnvironment = readAuthEnvironment()
): Promise<void> {
  await requireSession(readSessionCookie(request), environment.sessionSecret);
}

export async function requireSessionMutation(
  request: Request,
  environment: AuthEnvironment = readAuthEnvironment()
): Promise<void> {
  requireAllowedOrigin(request, environment.allowedOrigins);
  await requireRequestSession(request, environment);
}
