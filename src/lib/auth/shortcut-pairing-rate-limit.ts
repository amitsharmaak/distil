import { createHash } from "node:crypto";
import type { Sql } from "postgres";

import { AuthError } from "@/lib/auth/errors";
import { requestIp } from "@/lib/auth/request";
import { config } from "@/lib/config";
import { getSharedPostgresClient } from "@/lib/postgres/client";

/**
 * Anonymous guesses have no tenant. The runtime can only execute this bounded
 * SQL capability, never read/write its operational table or choose its policy.
 * The database enforces ten attempts per fifteen minutes using its own clock.
 */
export async function enforceShortcutPairingRateLimit(request: Request, sql?: Sql): Promise<void> {
  const database = sql ?? getSharedPostgresClient(config.databaseUrl);
  const keyHash = createHash("sha256")
    .update(`pairing:${requestIp(request)}`)
    .digest("hex");
  const [result] = await database<Array<{ allowed: boolean }>>`
    SELECT public.distil_consume_shortcut_pairing_rate_limit(${keyHash}) AS allowed
  `;
  if (result?.allowed === false) {
    throw new AuthError("RATE_LIMITED", 429, "Rate limit exceeded");
  }
  if (result?.allowed !== true) throw new Error("Pairing rate limit unavailable");
}
