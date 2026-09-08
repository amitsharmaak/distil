import type { AuthContext } from "@/lib/contracts";
import type { Sql } from "postgres";

export const CONNECTOR_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const CONNECTOR_OAUTH_PROVIDERS = ["gmail", "slack"] as const;
export type ConnectorOAuthProvider = (typeof CONNECTOR_OAUTH_PROVIDERS)[number];

export interface ConnectorOAuthState {
  nonce: string;
  userId: string;
  sessionId?: string;
  provider: ConnectorOAuthProvider;
  returnPath: string;
  pkceVerifierHash: string;
  redirectUri: string;
  expiresAt: string;
}

/**
 * This is deliberately a persistence port, not a process-local cache. `consume`
 * must be implemented as one transaction (delete/update-and-return) so an OAuth
 * callback can use a nonce exactly once across concurrent server instances.
 */
export interface ConnectorOAuthStateRepository {
  create(state: ConnectorOAuthState): Promise<void>;
  consume(input: {
    nonce: string;
    provider: ConnectorOAuthProvider;
    userId: string;
    sessionId?: string;
    now: string;
  }): Promise<ConnectorOAuthState | undefined>;
}

export function normalizeConnectorReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 512 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/api") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    return "/sources";
  return value;
}

export function createConnectorOAuthState(
  context: AuthContext,
  provider: ConnectorOAuthProvider,
  returnPath: string | null | undefined,
  binding: { pkceVerifierHash: string; redirectUri: string },
  now = new Date(),
  nonce = crypto.randomUUID()
): ConnectorOAuthState {
  return {
    nonce,
    userId: context.userId,
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
    provider,
    returnPath: normalizeConnectorReturnPath(returnPath),
    pkceVerifierHash: binding.pkceVerifierHash,
    redirectUri: binding.redirectUri,
    expiresAt: new Date(now.getTime() + CONNECTOR_OAUTH_STATE_TTL_MS).toISOString(),
  };
}

export async function consumeConnectorOAuthState(
  repository: ConnectorOAuthStateRepository,
  input: { nonce: string; provider: ConnectorOAuthProvider; context: AuthContext; now?: Date }
): Promise<ConnectorOAuthState | undefined> {
  const state = await repository.consume({
    nonce: input.nonce,
    provider: input.provider,
    userId: input.context.userId,
    ...(input.context.sessionId ? { sessionId: input.context.sessionId } : {}),
    now: (input.now ?? new Date()).toISOString(),
  });
  if (!state || state.userId !== input.context.userId) return undefined;
  if (state.sessionId !== undefined && state.sessionId !== input.context.sessionId)
    return undefined;
  if (new Date(state.expiresAt).getTime() <= (input.now ?? new Date()).getTime()) return undefined;
  return state;
}

interface OAuthStateRow {
  nonce: string;
  user_id: string;
  session_id: string | null;
  provider: ConnectorOAuthProvider;
  return_path: string;
  pkce_verifier_hash: string;
  redirect_uri: string;
  expires_at: Date | string;
}

function mapRow(row: OAuthStateRow | undefined): ConnectorOAuthState | undefined {
  if (!row) return undefined;
  return {
    nonce: row.nonce,
    userId: row.user_id,
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    provider: row.provider,
    returnPath: row.return_path,
    pkceVerifierHash: row.pkce_verifier_hash,
    redirectUri: row.redirect_uri,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export class PostgresConnectorOAuthStateRepository implements ConnectorOAuthStateRepository {
  constructor(private readonly sql: Sql) {}

  async create(state: ConnectorOAuthState): Promise<void> {
    await this.sql`
      INSERT INTO connector_oauth_states
        (user_id,nonce,provider,session_id,return_path,pkce_verifier_hash,redirect_uri,expires_at,created_at)
      VALUES (${state.userId}::uuid,${state.nonce}::uuid,${state.provider},${state.sessionId ?? null}::uuid,
        ${state.returnPath},${state.pkceVerifierHash},${state.redirectUri},${state.expiresAt}::timestamptz,now())`;
  }

  async consume(input: {
    nonce: string;
    provider: ConnectorOAuthProvider;
    userId: string;
    sessionId?: string;
    now: string;
  }): Promise<ConnectorOAuthState | undefined> {
    const rows = await this.sql<OAuthStateRow[]>`
      DELETE FROM connector_oauth_states
      WHERE user_id=${input.userId}::uuid AND nonce=${input.nonce}::uuid AND provider=${input.provider}
        AND session_id IS NOT DISTINCT FROM ${input.sessionId ?? null}::uuid
        AND expires_at>${input.now}::timestamptz
      RETURNING *`;
    return mapRow(rows[0]);
  }
}
