import type { AuthRepositoryPort } from "@/lib/auth/ports";
import {
  createReauthenticationHandler,
  type ReauthenticationProvider,
} from "@/lib/auth/reauthentication";

const origin = "https://distil.example";
const findAccountByIdentity = jest.fn();
const getSession = jest.fn();
const magicLink = jest.fn();

function handler() {
  return createReauthenticationHandler({
    provider: { getSession, signIn: { magicLink } } as ReauthenticationProvider,
    repositories: { findAccountByIdentity } as unknown as AuthRepositoryPort,
    appOrigin: origin,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({
    data: {
      user: { id: "provider-owner", email: "owner@example.test", emailVerified: true },
      session: { id: "22222222-2222-4222-8222-222222222222", createdAt: new Date(0) },
    },
    error: null,
  });
  findAccountByIdentity.mockResolvedValue({
    userId: "11111111-1111-4111-8111-111111111111",
    status: "active",
  });
  magicLink.mockResolvedValue({ error: null });
});

describe("fresh authentication ceremony", () => {
  it("sends a new magic link only to the mapped session identity", async () => {
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin },
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(magicLink).toHaveBeenCalledWith({
      email: "owner@example.test",
      callbackURL: "https://distil.example/account?reauthenticated=1",
      newUserCallbackURL: "https://distil.example/access-denied",
      errorCallbackURL: "https://distil.example/access-denied",
    });
  });

  it.each([
    ["a hostile origin", { origin: "https://hostile.example" }],
    ["an absent session", { origin, session: null }],
    ["an unmapped identity", { origin, account: null }],
  ])("fails closed for %s", async (_case, input) => {
    if ("session" in input) getSession.mockResolvedValue({ data: input.session, error: null });
    if ("account" in input) findAccountByIdentity.mockResolvedValue(input.account);
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin: input.origin },
      })
    );
    expect(response.status).toBe(503);
    expect(magicLink).not.toHaveBeenCalled();
  });

  it("does not disclose provider errors or the account email", async () => {
    magicLink.mockResolvedValue({ error: new Error("smtp owner@example.test secret") });
    const response = await handler()(
      new Request(`${origin}/api/auth/reauthenticate`, {
        method: "POST",
        headers: { origin },
      })
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("owner@example.test");
  });
});
