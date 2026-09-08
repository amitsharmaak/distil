import type { AuthPrincipal, CaptureDispatcher } from "@/lib/contracts/capture";
import { resolveCapturePrincipal } from "@/lib/auth";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import { getCaptureTokenIdentityResolver, getTenantRepositories } from "@/lib/database";
import { createVercelCaptureDispatcher } from "@/lib/queue/dispatchers";
import { CaptureService } from "./service";

export interface CaptureRouteComposition {
  service(context: AuthContext): Promise<CaptureService>;
  authenticate(request: Request): Promise<AuthPrincipal | undefined>;
}

async function defaultDispatcher(): Promise<CaptureDispatcher> {
  return createVercelCaptureDispatcher();
}

export async function composeCaptureRoutes(): Promise<CaptureRouteComposition> {
  const auth = readAuthEnvironment();
  const dispatcher = await defaultDispatcher();
  const tokenIdentities = await getCaptureTokenIdentityResolver();
  return {
    service: async (context) => {
      const repositories = await getTenantRepositories(context);
      return new CaptureService({ context, captures: repositories.captures, dispatcher });
    },
    authenticate: async (request) => {
      const principal = await resolveCapturePrincipal(request, {
        tokenIdentities,
        getTenantRepositories,
        resolveSessionContext: resolveRequestAuthContext,
      });
      if (principal?.kind === "session" && request.method !== "GET" && request.method !== "HEAD") {
        requireAllowedOrigin(request, auth.allowedOrigins);
      }
      return principal;
    },
  };
}
