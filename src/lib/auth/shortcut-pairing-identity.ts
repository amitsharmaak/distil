import type { Sql } from "postgres";
import { userIdSchema, type UserId } from "@/lib/contracts/tenant-context";

export interface ShortcutPairingIdentity {
  readonly pairingId: string;
  readonly userId: UserId;
}

export interface ShortcutPairingIdentityResolver {
  /** Exact hash lookup only; never enumerate or approximately match pending pairings. */
  resolveByHash(codeHash: string): Promise<ShortcutPairingIdentity | undefined>;
}

/** The runtime role can only execute the narrowly scoped SECURITY DEFINER lookup. */
export class PostgresShortcutPairingIdentityResolver implements ShortcutPairingIdentityResolver {
  constructor(private readonly sql: Sql) {}

  async resolveByHash(codeHash: string): Promise<ShortcutPairingIdentity | undefined> {
    const [row] = await this.sql<Array<{ pairing_id: string; user_id: string }>>`
      SELECT pairing_id, user_id
      FROM distil_resolve_shortcut_pairing(${codeHash})
    `;
    return row
      ? { pairingId: String(row.pairing_id), userId: userIdSchema.parse(row.user_id) }
      : undefined;
  }
}
