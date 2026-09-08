jest.mock("@/lib/auth/neon-auth-foundation", () => ({ readNeonAuthFoundation: jest.fn() }));
const mockGetSession = jest.fn();
jest.mock("@/lib/auth/neon-server", () => ({
  getNeonAuthServer: jest.fn(() => ({ getSession: mockGetSession })),
}));
jest.mock("@/lib/auth/repository-runtime", () => ({ getAuthRepositoryPort: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { AccessDeniedError } from "@/lib/auth/account";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";
import { getTenantRepositories } from "@/lib/database";
import { LifecycleError } from "@/lib/lifecycle/errors";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

const ownerId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const findAccountByIdentity = jest.fn();
const tenantRepositories = { lifecycle: {} };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readNeonAuthFoundation).mockReturnValue({
    enabled: true,
    status: "ready",
    missing: [],
  });
  mockGetSession.mockResolvedValue({
    data: {
      user: {
        id: "provider-owner",
        email: "owner@example.test",
        emailVerified: true,
      },
      session: { id: sessionId, createdAt: new Date() },
    },
    error: null,
  });
  jest.mocked(getAuthRepositoryPort).mockResolvedValue({ findAccountByIdentity } as never);
  jest.mocked(getTenantRepositories).mockResolvedValue(tenantRepositories as never);
  findAccountByIdentity.mockResolvedValue({ userId: ownerId, status: "active" });
});

describe("lifecycle recovery route authorization", () => {
  it("derives the owner from provider identity and ignores forged tenant headers", async () => {
    const result = await requireLifecycleRoute(
      new Request("https://distil.example/api/v1/account/deletion", {
        headers: {
          "x-trace-id": requestId,
          "x-distil-user-id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      })
    );
    expect(findAccountByIdentity).toHaveBeenCalledWith({
      provider: "neon",
      providerSubject: "provider-owner",
    });
    expect(result.context).toMatchObject({
      userId: ownerId,
      actorId: ownerId,
      sessionId,
      requestId,
    });
    expect(getTenantRepositories).toHaveBeenCalledWith(result.context);
  });

  it("permits deletion_pending only for the explicit recovery capability", async () => {
    findAccountByIdentity.mockResolvedValue({ userId: ownerId, status: "deletion_pending" });
    const request = new Request("https://distil.example/api/v1/account/deletion");
    await expect(requireLifecycleRoute(request)).rejects.toEqual(new AccessDeniedError("disabled"));
    expect(getTenantRepositories).not.toHaveBeenCalled();

    await expect(
      requireLifecycleRoute(request, { allowDeletionPending: true })
    ).resolves.toMatchObject({
      account: { userId: ownerId, status: "deletion_pending" },
      repositories: tenantRepositories,
    });
  });

  it.each(["migration_pending", "suspended", "deleted"] as const)(
    "does not widen recovery access to %s accounts",
    async (status) => {
      findAccountByIdentity.mockResolvedValue({ userId: ownerId, status });
      await expect(
        requireLifecycleRoute(new Request("https://distil.example/api/v1/account/deletion"), {
          allowDeletionPending: true,
        })
      ).rejects.toMatchObject({ name: "AccessDeniedError", reason: "disabled" });
      expect(getTenantRepositories).not.toHaveBeenCalled();
    }
  );

  it("keeps fresh authentication enforced for deletion cancellation", async () => {
    findAccountByIdentity.mockResolvedValue({ userId: ownerId, status: "deletion_pending" });
    mockGetSession.mockResolvedValue({
      data: {
        user: {
          id: "provider-owner",
          email: "owner@example.test",
          emailVerified: true,
        },
        session: { id: sessionId, createdAt: new Date(0) },
      },
      error: null,
    });
    await expect(
      requireLifecycleRoute(new Request("https://distil.example/api/v1/account/deletion"), {
        allowDeletionPending: true,
        fresh: true,
      })
    ).rejects.toMatchObject({
      name: "LifecycleError",
      code: "FRESH_AUTH_REQUIRED",
      recovery: { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" },
    });
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("does not require fresh authentication for deletion status hydration", async () => {
    findAccountByIdentity.mockResolvedValue({ userId: ownerId, status: "deletion_pending" });
    mockGetSession.mockResolvedValue({
      data: {
        user: {
          id: "provider-owner",
          email: "owner@example.test",
          emailVerified: true,
        },
        session: { id: sessionId, createdAt: new Date(0) },
      },
      error: null,
    });
    await expect(
      requireLifecycleRoute(new Request("https://distil.example/api/v1/account/deletion"), {
        allowDeletionPending: true,
      })
    ).resolves.toMatchObject({ account: { status: "deletion_pending" } });
  });

  it("keeps lifecycle recovery dormant while Neon Auth is disabled", async () => {
    jest.mocked(readNeonAuthFoundation).mockReturnValue({
      enabled: false,
      status: "disabled",
      missing: [],
    });
    await expect(
      requireLifecycleRoute(new Request("https://distil.example/api/v1/account/deletion"), {
        allowDeletionPending: true,
      })
    ).rejects.toEqual(new LifecycleError("NOT_FOUND", 404, "Not found"));
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
