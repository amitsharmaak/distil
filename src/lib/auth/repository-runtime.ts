import { getRepositorySet } from "@/lib/database";
import type { AuthRepositoryPort } from "@/lib/auth/ports";

export class AuthRepositoryUnavailableError extends Error {
  constructor() {
    super("Authentication repositories are unavailable");
    this.name = "AuthRepositoryUnavailableError";
  }
}

/**
 * Integration seam for the schema workstream. Feature-off deployments never
 * read this property. Feature-on deployments fail closed until the concrete
 * PostgreSQL adapter is present as RepositorySet.auth.
 */
export async function getAuthRepositoryPort(): Promise<AuthRepositoryPort> {
  const repositories = (await getRepositorySet()) as unknown as { auth?: AuthRepositoryPort };
  if (!repositories.auth) throw new AuthRepositoryUnavailableError();
  return repositories.auth;
}
