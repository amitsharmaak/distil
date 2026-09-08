import type { AuthAccountPurger } from "@/lib/lifecycle/ports";

import { LifecycleError } from "./errors";
import { NeonAuthAccountPurger } from "./neon-auth-account-purger";

let cached:
  | {
      apiKey: string;
      projectId: string;
      branchId: string;
      purger: AuthAccountPurger;
    }
  | undefined;

/** Exact opt-in factory; incomplete or unknown provider configuration fails closed. */
export function getLifecycleAuthPurger(
  environment: Readonly<Record<string, string | undefined>> = process.env
): AuthAccountPurger {
  if (environment.DISTIL_AUTH_PURGE_PROVIDER !== "neon") {
    throw new LifecycleError(
      "UNAVAILABLE",
      503,
      "Identity purge dependency is not configured for lifecycle workers"
    );
  }
  const apiKey = environment.NEON_API_KEY;
  const projectId = environment.NEON_PROJECT_ID;
  const branchId = environment.NEON_BRANCH_ID;
  if (!apiKey || !projectId || !branchId) {
    throw new LifecycleError("UNAVAILABLE", 503, "Identity purge dependency is misconfigured");
  }
  if (cached?.apiKey === apiKey && cached.projectId === projectId && cached.branchId === branchId) {
    return cached.purger;
  }
  const purger = new NeonAuthAccountPurger({ apiKey, projectId, branchId });
  cached = { apiKey, projectId, branchId, purger };
  return purger;
}
