import type { NeonQueryFunction } from "@neondatabase/serverless";

import { mapAuthAccount, type AuthAccountRow } from "@/lib/auth/account-row";
import type { ProviderIdentity } from "@/lib/auth/account";
import type { AuthIdentityLookupPort } from "@/lib/auth/ports";
import { recordDatabaseStatement } from "@/lib/observability/request-metrics";

const RESOLVE_IDENTITY_QUERY = "SELECT * FROM distil_resolve_auth_identity($1, $2)";

type NeonHttpQuery = Pick<NeonQueryFunction<false, false>, "query">;

/** Proxy-only exact-key account lookup over Neon's stateless HTTP transport. */
export class NeonHttpAuthRepository implements AuthIdentityLookupPort {
  constructor(private readonly sql: NeonHttpQuery) {}

  async findAccountByIdentity(input: {
    provider: ProviderIdentity["provider"];
    providerSubject: string;
  }) {
    // Unlike postgres.js, neon() has no debug hook. Count this one statement
    // explicitly without recording parameters or connection details.
    recordDatabaseStatement(RESOLVE_IDENTITY_QUERY);
    const rows = (await this.sql.query(RESOLVE_IDENTITY_QUERY, [
      input.provider,
      input.providerSubject,
    ])) as AuthAccountRow[];
    return mapAuthAccount(rows[0]);
  }
}
