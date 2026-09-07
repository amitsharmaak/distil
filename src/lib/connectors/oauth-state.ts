import type { AuthContext } from "@/lib/contracts";

export const CONNECTOR_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const CONNECTOR_OAUTH_PROVIDERS = ["gmail", "slack"] as const;
export type ConnectorOAuthProvider = (typeof CONNECTOR_OAUTH_PROVIDERS)[number];

export interface ConnectorOAuthState {
  nonce: string;
  userId: string;
  sessionId?: string;
  provider: ConnectorOAuthProvider;
  returnPath: string;
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
    now: string;
  }): Promise<ConnectorOAuthState | undefined>;
}

export function normalizeConnectorReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/sources";
  return value;
}

export function createConnectorOAuthState(
  context: AuthContext,
  provider: ConnectorOAuthProvider,
  returnPath: string | null | undefined,
  now = new Date(),
  nonce = crypto.randomUUID()
): ConnectorOAuthState {
  return {
    nonce,
    userId: context.userId,
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
    provider,
    returnPath: normalizeConnectorReturnPath(returnPath),
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
    now: (input.now ?? new Date()).toISOString(),
  });
  if (!state || state.userId !== input.context.userId) return undefined;
  if (state.sessionId !== undefined && state.sessionId !== input.context.sessionId)
    return undefined;
  if (new Date(state.expiresAt).getTime() <= (input.now ?? new Date()).getTime()) return undefined;
  return state;
}
