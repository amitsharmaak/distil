import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";

let cached: { baseUrl: string; secret: string; auth: NeonAuth } | undefined;

export class NeonAuthConfigurationError extends Error {
  constructor(readonly missing: readonly string[]) {
    super("Neon Auth is unavailable");
    this.name = "NeonAuthConfigurationError";
  }
}

export function getNeonAuthServer(
  environment: Readonly<Record<string, string | undefined>> = process.env
): NeonAuth {
  const foundation = readNeonAuthFoundation(environment);
  if (foundation.status !== "ready") throw new NeonAuthConfigurationError(foundation.missing);

  const baseUrl = environment.NEON_AUTH_BASE_URL!;
  const secret = environment.NEON_AUTH_COOKIE_SECRET!;
  if (cached?.baseUrl === baseUrl && cached.secret === secret) return cached.auth;

  const auth = createNeonAuth({
    baseUrl,
    cookies: { secret, sessionDataTtl: 300, sameSite: "lax" },
    logLevel: "warn",
  });
  cached = { baseUrl, secret, auth };
  return auth;
}
