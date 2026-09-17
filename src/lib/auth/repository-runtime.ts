import { getPostgresClient } from "@/lib/database";
import type { AuthRepositoryPort } from "@/lib/auth/ports";

export class AuthRepositoryUnavailableError extends Error {
  constructor() {
    super("Authentication repositories are unavailable");
    this.name = "AuthRepositoryUnavailableError";
  }
}

let authRepositoryPromise: Promise<AuthRepositoryPort> | undefined;

/**
 * The proxy's account lookup adapter. Feature-off deployments never read this.
 * Feature-on deployments fail closed when PostgreSQL is not configured. Only
 * the auth adapter is constructed, on the shared client, so the proxy never
 * loads the full repository set.
 */
export async function getAuthRepositoryPort(): Promise<AuthRepositoryPort> {
  authRepositoryPromise ??= Promise.all([
    getPostgresClient(),
    import("@/lib/postgres/auth-repository"),
  ]).then(
    ([sql, adapter]) => new adapter.PostgresAuthRepository(sql),
    () => {
      authRepositoryPromise = undefined;
      throw new AuthRepositoryUnavailableError();
    }
  );
  return authRepositoryPromise;
}
