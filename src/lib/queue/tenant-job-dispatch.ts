import { config } from "@/lib/config";
import { aiLogger, sanitizeLogError } from "@/lib/logger";
import {
  createVercelTenantJobDispatcher,
  InlineTenantJobDispatcher,
  type TenantJobDispatcher,
} from "@/lib/queue/dispatchers";

/**
 * How tenant jobs reach the worker. Follows the capture dispatch switch:
 * `queue` publishes to the Vercel Queue topic `account-lifecycle`, whose
 * callback runs the allowlisted tenant handlers; `inline` runs the same
 * consumer inside the local `next dev` process. Never `inline` on Vercel.
 */
export async function resolveTenantJobDispatcher(): Promise<TenantJobDispatcher> {
  if (config.captureDispatch === "inline") {
    const { consumeLifecycleTenantJobEnvelope } = await import("@/lib/lifecycle/queue-runtime");
    return new InlineTenantJobDispatcher(
      (message) => consumeLifecycleTenantJobEnvelope(message),
      (error) => {
        aiLogger.error(
          { event: "tenant_job_inline_failed", err: sanitizeLogError(error) },
          "inline tenant job failed"
        );
      }
    );
  }
  return createVercelTenantJobDispatcher();
}
