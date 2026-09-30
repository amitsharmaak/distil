import { getPostgresClient } from "@/lib/database";
import type { AuthRepositoryPort } from "@/lib/auth/ports";
import { AuthRepositoryUnavailableError } from "@/lib/auth/repository-errors";

export { AuthRepositoryUnavailableError } from "@/lib/auth/repository-errors";

let authRepositoryPromise: Promise<AuthRepositoryPort> | undefined;

/**
 * Full authentication repository for route and lifecycle workflows. It stays
 * on the shared postgres.js client; the proxy's narrower HTTP lookup lives in
 * proxy-repository-runtime.ts.
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
