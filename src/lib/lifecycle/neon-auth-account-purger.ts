import {
  authProviderSubjectSchema,
  type AuthAccountPurger,
  type AuthProviderSubject,
} from "@/lib/lifecycle/ports";

const SAFE_NEON_RESOURCE_ID = /^[a-z0-9-]{1,60}$/u;

export interface NeonAuthPurgerOptions {
  apiKey: string;
  projectId: string;
  branchId: string;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
}

/**
 * Uses Neon's project/branch-scoped management API to remove the provider
 * identity. Neon performs session removal as part of that operation, so the
 * two lifecycle port calls coalesce into one idempotent provider request.
 */
export class NeonAuthAccountPurger implements AuthAccountPurger {
  private readonly request: typeof fetch;
  private readonly endpoint: string;
  private readonly completed = new Set<AuthProviderSubject>();
  private readonly pending = new Map<AuthProviderSubject, Promise<void>>();

  constructor(private readonly options: NeonAuthPurgerOptions) {
    if (!options.apiKey.trim()) throw new Error("Neon API key is required for identity purge");
    if (!SAFE_NEON_RESOURCE_ID.test(options.projectId)) throw new Error("Invalid Neon project ID");
    if (!SAFE_NEON_RESOURCE_ID.test(options.branchId)) throw new Error("Invalid Neon branch ID");
    const base = new URL(options.apiBaseUrl ?? "https://console.neon.tech/api/v2/");
    if (base.protocol !== "https:" && base.hostname !== "localhost") {
      throw new Error("Neon management API must use HTTPS");
    }
    this.endpoint = new URL(
      `projects/${options.projectId}/branches/${options.branchId}/auth/users/`,
      base
    ).toString();
    this.request = options.fetch ?? fetch;
  }

  private purge(providerSubject: AuthProviderSubject): Promise<void> {
    const parsed = authProviderSubjectSchema.parse(providerSubject);
    if (this.completed.has(parsed)) return Promise.resolve();
    const existing = this.pending.get(parsed);
    if (existing) return existing;
    const operation = this.deleteUser(parsed).finally(() => this.pending.delete(parsed));
    this.pending.set(parsed, operation);
    return operation;
  }

  private async deleteUser(providerSubject: AuthProviderSubject): Promise<void> {
    const response = await this.request(`${this.endpoint}${encodeURIComponent(providerSubject)}`, {
      method: "DELETE",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    // A prior successful attempt may have lost its response; normalize the
    // resulting not-found response to success for lifecycle job redelivery.
    if (response.status === 204 || response.status === 404) {
      this.completed.add(providerSubject);
      return;
    }
    throw new Error(`Neon identity purge failed with status ${response.status}`);
  }

  revokeSessions(providerSubject: AuthProviderSubject): Promise<void> {
    return this.purge(providerSubject);
  }

  deleteIdentity(providerSubject: AuthProviderSubject): Promise<void> {
    return this.purge(providerSubject);
  }
}
