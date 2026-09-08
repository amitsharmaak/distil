import type { Sql } from "postgres";

import { userIdSchema, type UserId } from "@/lib/contracts/tenant-context";

export interface CaptureTokenIdentity {
  readonly tokenId: string;
  readonly userId: UserId;
  readonly revokedAt?: string;
}

export interface CaptureTokenIdentityResolver {
  /** Exact hash lookup only. This is not a token browsing API. */
  resolveActiveByHash(tokenHash: string): Promise<CaptureTokenIdentity | undefined>;
}

interface CaptureTokenIdentityRow {
  token_id: string;
  user_id: string;
  revoked_at: Date | string | null;
}

/**
 * Pre-context adapter backed by a narrowly scoped SECURITY DEFINER function.
 * The runtime role receives EXECUTE only; all later reads/writes use a tenant
 * transaction after this exact-key lookup establishes the owner.
 */
export class PostgresCaptureTokenIdentityResolver implements CaptureTokenIdentityResolver {
  constructor(private readonly sql: Sql) {}

  async resolveActiveByHash(tokenHash: string): Promise<CaptureTokenIdentity | undefined> {
    const [row] = await this.sql<CaptureTokenIdentityRow[]>`
      SELECT token_id, user_id, revoked_at
      FROM distil_resolve_capture_token(${tokenHash})
    `;
    if (!row || row.revoked_at !== null) return undefined;
    return {
      tokenId: String(row.token_id),
      userId: userIdSchema.parse(row.user_id),
    };
  }
}
