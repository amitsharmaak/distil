import type { AuthPrincipal, CaptureDispatcher } from "@/lib/contracts/capture";
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

/**
 * Fail-closed composition seam. The authentication wave replaces the resolver
 * with `resolveCapturePrincipal`; route factories remain independently testable.
 */
export async function composeCaptureRoutes(): Promise<CaptureRouteComposition> {
  const repositories = await getRepositorySet();
  return {
    service: new CaptureService({
      captures: repositories.captures,
      dispatcher: await defaultDispatcher(),
    }),
    authenticate: async () => undefined,
  };
}
