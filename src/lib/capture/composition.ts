import type { AuthPrincipal, CaptureDispatcher } from "@/lib/contracts/capture";
import { resolveCapturePrincipal } from "@/lib/auth";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getRepositorySet } from "@/lib/database";
import { createVercelCaptureDispatcher } from "@/lib/queue/dispatchers";
import { CaptureService } from "./service";

export interface CaptureRouteComposition {
  service: CaptureService;
  authenticate(request: Request): Promise<AuthPrincipal | undefined>;
}

async function defaultDispatcher(): Promise<CaptureDispatcher> {
  return createVercelCaptureDispatcher();
}

export async function composeCaptureRoutes(): Promise<CaptureRouteComposition> {
  const repositories = await getRepositorySet();
  const auth = readAuthEnvironment();
  return {
    service: new CaptureService({
      captures: repositories.captures,
      dispatcher: await defaultDispatcher(),
    }),
    authenticate: async (request) => {
      const principal = await resolveCapturePrincipal(request, {
        captureTokens: repositories.captureTokens,
        rateLimits: repositories.rateLimits,
        sessionSecret: auth.sessionSecret,
      });
      if (principal?.kind === "session" && request.method !== "GET" && request.method !== "HEAD") {
        requireAllowedOrigin(request, auth.allowedOrigins);
      }
      return principal;
    },
  };
}
