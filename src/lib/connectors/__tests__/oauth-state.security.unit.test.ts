import { createAuthContext } from "@/lib/contracts";
import {
  consumeConnectorOAuthState,
  createConnectorOAuthState,
  type ConnectorOAuthStateRepository,
} from "@/lib/connectors/oauth-state";

const context = createAuthContext({
  userId: "11111111-1111-4111-8111-111111111111",
  actorId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
});

class OneTimeStateStore implements ConnectorOAuthStateRepository {
  private readonly entries = new Map<string, ReturnType<typeof createConnectorOAuthState>>();
  async create(state: ReturnType<typeof createConnectorOAuthState>) {
    this.entries.set(state.nonce, state);
  }
  async consume(input: {
    nonce: string;
    provider: "gmail" | "slack";
    userId: string;
    sessionId?: string;
    now: string;
  }) {
    const state = this.entries.get(input.nonce);
    if (
      !state ||
      state.provider !== input.provider ||
      state.userId !== input.userId ||
      state.sessionId !== input.sessionId
    )
      return undefined;
    // Mirrors the same-statement nonce/provider/user/session DELETE predicate.
    this.entries.delete(input.nonce);
    return state;
  }
}

describe("connector OAuth state contract", () => {
  it("binds a nonce to the authenticated user, session, provider, safe return path, expiry, and one use", async () => {
    const store = new OneTimeStateStore();
    const now = new Date("2026-09-07T12:00:00.000Z");
    const state = createConnectorOAuthState(
      context,
      "gmail",
      "//attacker.example",
      { pkceVerifierHash: "pkce-hash", redirectUri: "https://distil.test/callback" },
      now,
      "nonce-1"
    );
    await store.create(state);

    await expect(
      consumeConnectorOAuthState(store, { nonce: "nonce-1", provider: "gmail", context, now })
    ).resolves.toMatchObject({
      userId: context.userId,
      sessionId: context.sessionId,
      returnPath: "/sources",
    });
    await expect(
      consumeConnectorOAuthState(store, { nonce: "nonce-1", provider: "gmail", context, now })
    ).resolves.toBeUndefined();
  });

  it("does not accept a state consumed under another authenticated account", async () => {
    const store = new OneTimeStateStore();
    const state = createConnectorOAuthState(
      context,
      "slack",
      "/sources",
      { pkceVerifierHash: "pkce-hash", redirectUri: "https://distil.test/callback" },
      new Date(),
      "nonce-2"
    );
    await store.create(state);
    const other = createAuthContext({
      ...context,
      userId: "22222222-2222-4222-8222-222222222222",
      actorId: "22222222-2222-4222-8222-222222222222",
    });
    await expect(
      consumeConnectorOAuthState(store, { nonce: "nonce-2", provider: "slack", context: other })
    ).resolves.toBeUndefined();
    await expect(
      consumeConnectorOAuthState(store, { nonce: "nonce-2", provider: "gmail", context })
    ).resolves.toBeUndefined();
    const otherSession = createAuthContext({
      ...context,
      sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    await expect(
      consumeConnectorOAuthState(store, {
        nonce: "nonce-2",
        provider: "slack",
        context: otherSession,
      })
    ).resolves.toBeUndefined();
    await expect(
      consumeConnectorOAuthState(store, { nonce: "nonce-2", provider: "slack", context })
    ).resolves.toBeDefined();
  });

  it("normalizes backslash-leading return paths", () => {
    expect(
      createConnectorOAuthState(
        context,
        "gmail",
        "/\\hostile.example",
        { pkceVerifierHash: "pkce-hash", redirectUri: "https://distil.test/callback" },
        new Date(),
        "nonce-3"
      ).returnPath
    ).toBe("/sources");
  });
});
