import type { Sql } from "postgres";

import type {
  AuthRepositoryPort,
  ConsumeInvitationInput,
  InvitationRecord,
} from "@/lib/auth/ports";
import type { LinkedAccount, ProviderIdentity } from "@/lib/auth/account";
import { userIdSchema } from "@/lib/contracts/tenant-context";

interface AccountRow {
  user_id: string;
  primary_email: string | null;
  status: LinkedAccount["status"];
}

interface InvitationRow {
  id: string;
  normalized_email: string;
  email_hash: string;
  token_salt: string;
  token_hash: string;
  status: InvitationRecord["status"];
  issued_by_actor_id: string;
  issuance_reason: string;
  created_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  revoked_by_actor_id: string | null;
  revoke_reason: string | null;
  consumed_at: Date | string | null;
  consumed_by_user_id: string | null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapAccount(row: AccountRow | undefined): LinkedAccount | undefined {
  if (!row) return undefined;
  const userId = userIdSchema.parse(row.user_id);
  return {
    userId,
    ...(row.primary_email ? { primaryEmail: row.primary_email } : {}),
    status: row.status,
  };
}

function mapInvitation(row: InvitationRow | undefined): InvitationRecord | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    normalizedEmail: row.normalized_email,
    emailHash: row.email_hash,
    tokenSalt: row.token_salt,
    tokenHash: row.token_hash,
    status: row.status,
    issuedByActorId: row.issued_by_actor_id,
    issuanceReason: row.issuance_reason,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    ...(row.revoked_at ? { revokedAt: iso(row.revoked_at) } : {}),
    ...(row.revoked_by_actor_id ? { revokedByActorId: row.revoked_by_actor_id } : {}),
    ...(row.revoke_reason ? { revokeReason: row.revoke_reason } : {}),
    ...(row.consumed_at ? { consumedAt: iso(row.consumed_at) } : {}),
    ...(row.consumed_by_user_id
      ? { consumedByUserId: userIdSchema.parse(row.consumed_by_user_id) }
      : {}),
  };
}

/**
 * Runtime identity reads/consumption use exact-key SECURITY DEFINER functions.
 * Operator issue/revoke writes succeed only when this adapter receives the
 * separately privileged control-plane client.
 */
export class PostgresAuthRepository implements AuthRepositoryPort {
  constructor(private readonly sql: Sql) {}

  async createInvitation(record: InvitationRecord): Promise<void> {
    await this.sql`
      INSERT INTO invitations (
        id, normalized_email, email_hash, token_salt, token_hash, status,
        issued_by_actor_id, issuance_reason, created_at, expires_at
      ) VALUES (
        ${record.id}::uuid, ${record.normalizedEmail}, ${record.emailHash}, ${record.tokenSalt},
        ${record.tokenHash}, ${record.status}, ${record.issuedByActorId}::uuid,
        ${record.issuanceReason}, ${record.createdAt}::timestamptz,
        ${record.expiresAt}::timestamptz
      )
    `;
  }

  async findInvitationById(id: string): Promise<InvitationRecord | undefined> {
    const [row] = await this.sql<InvitationRow[]>`
      SELECT * FROM distil_find_invitation(${id}::uuid)
    `;
    return mapInvitation(row);
  }

  async revokeInvitation(input: {
    invitationId: string;
    revokedAt: string;
    revokedByActorId: string;
    reason: string;
  }): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE invitations
      SET status = 'revoked', revoked_at = ${input.revokedAt}::timestamptz,
          revoked_by_actor_id = ${input.revokedByActorId}::uuid,
          revoke_reason = ${input.reason}
      WHERE id = ${input.invitationId}::uuid
        AND status = 'pending'
        AND revoked_at IS NULL
        AND consumed_at IS NULL
      RETURNING id::text AS id
    `;
    return rows.length === 1;
  }

  async consumeInvitationAndLinkIdentity(
    input: ConsumeInvitationInput
  ): Promise<LinkedAccount | undefined> {
    const [row] = await this.sql<AccountRow[]>`
      SELECT * FROM distil_consume_invitation(
        ${input.invitationId}::uuid,
        ${input.tokenHash},
        ${input.emailHash},
        ${input.provider},
        ${input.providerSubject},
        ${input.providerSessionId},
        ${input.consumedAt}::timestamptz
      )
    `;
    return mapAccount(row);
  }

  async findAccountByIdentity(input: {
    provider: ProviderIdentity["provider"];
    providerSubject: string;
  }): Promise<LinkedAccount | undefined> {
    const [row] = await this.sql<AccountRow[]>`
      SELECT * FROM distil_resolve_auth_identity(${input.provider}, ${input.providerSubject})
    `;
    return mapAccount(row);
  }
}
