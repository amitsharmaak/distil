import { config } from "@/lib/config";
import type { AuthIdentityLookupPort } from "@/lib/auth/ports";
import { AuthRepositoryUnavailableError } from "@/lib/auth/repository-errors";

let proxyAuthRepositoryPromise: Promise<AuthIdentityLookupPort> | undefined;

/**
 * Proxy-only identity lookup over Neon's stateless HTTP driver. Every route,
 * worker and tenant repository continues to use the existing postgres.js
 * clients; this narrow port cannot perform invitation or account-email work.
 */
export async function getProxyAuthRepositoryPort(): Promise<AuthIdentityLookupPort> {
  if (!config.databaseUrl) throw new AuthRepositoryUnavailableError();
  proxyAuthRepositoryPromise ??= Promise.all([
    import("@neondatabase/serverless"),
    import("@/lib/auth/neon-http-repository"),
  ])
    .then(
      ([client, adapter]) =>
        new adapter.NeonHttpAuthRepository(client.neon(config.databaseUrl, { fullResults: false }))
    )
    .catch(() => {
      proxyAuthRepositoryPromise = undefined;
      throw new AuthRepositoryUnavailableError();
    });
  return proxyAuthRepositoryPromise;
}
