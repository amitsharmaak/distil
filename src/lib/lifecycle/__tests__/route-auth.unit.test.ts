jest.mock("@/lib/auth/repository-runtime", () => ({ getAuthRepositoryPort: jest.fn() }));
jest.mock("@/lib/auth/neon-auth-foundation", () => ({ readNeonAuthFoundation: jest.fn() }));
jest.mock("@/lib/auth/request-context", () => ({
  resolveNeonLifecycleRecoveryRequest: jest.fn(),
}));
jest.mock("@/lib/auth/neon-server", () => ({ getNeonAuthServer: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { resolveNeonLifecycleRecoveryRequest } from "@/lib/auth/request-context";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

describe("lifecycle route fresh authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(readNeonAuthFoundation).mockReturnValue({
      enabled: true,
      status: "ready",
      missing: [],
    });
    jest.mocked(getAuthRepositoryPort).mockResolvedValue({
      findAccountByIdentity: jest.fn().mockResolvedValue({
        userId: "11111111-1111-4111-8111-111111111111",
        primaryEmail: "amit@example.com",
        status: "active",
      }),
    } as never);
  });

  it("preserves the authenticated session but returns FRESH_AUTH_REQUIRED when it is stale", async () => {
    jest.mocked(resolveNeonLifecycleRecoveryRequest).mockResolvedValue({
      identity: {
        provider: "neon",
        subject: "provider-user-1",
        email: "amit@example.com",
        emailVerified: true,
        sessionId: "session-1",
        authenticatedAt: new Date(Date.now() - 11 * 60 * 1000),
      },
      account: {
        userId: "11111111-1111-4111-8111-111111111111",
        primaryEmail: "amit@example.com",
        status: "active",
      },
      context: {
        userId: "11111111-1111-4111-8111-111111111111",
        actorKind: "user",
        actorId: "11111111-1111-4111-8111-111111111111",
        requestId: "22222222-2222-4222-8222-222222222222",
        sessionId: "session-1",
      },
      freshAuth: {
        authenticatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        freshUntil: new Date(Date.now() - 60 * 1000).toISOString(),
        isFresh: false,
      },
    } as never);

    await expect(
      requireLifecycleRoute(new Request("https://distil.example/api/v1/account/export"), {
        fresh: true,
      })
    ).rejects.toMatchObject({
      code: "FRESH_AUTH_REQUIRED",
      status: 403,
      recovery: { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" },
    });
  });
});
