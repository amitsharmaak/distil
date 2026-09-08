jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { AccessDeniedError } from "../account";
import { resolveRequestAuthContext } from "../account-service";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import { getTenantRepositories } from "@/lib/database";
import { requireTenantRoute, tenantRouteFailureResponse } from "../tenant-route";

const userId = "10000000-0000-4000-8000-000000000001";
const context = createAuthContext({
  userId,
  actorKind: "user",
  actorId: userId,
  requestId: "30000000-0000-4000-8000-000000000001",
});

describe("tenant route boundary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("derives repositories only from the authenticated request context", async () => {
    const repositories = { items: {} };
    jest.mocked(resolveRequestAuthContext).mockResolvedValue(context);
    jest.mocked(getTenantRepositories).mockResolvedValue(repositories as never);

    await expect(
      requireTenantRoute(new Request("https://distil.example/api/items"))
    ).resolves.toEqual({
      context,
      repositories,
    });
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
  });

  it("does not resolve a repository when authentication fails", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValue(new AccessDeniedError("unauthenticated"));

    await expect(
      requireTenantRoute(new Request("https://distil.example/api/items"))
    ).rejects.toThrow("Unable to continue");
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("keeps authorization failure bodies generic", async () => {
    const response = tenantRouteFailureResponse(new AccessDeniedError("disabled"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "ACCESS_DENIED", message: "Unable to continue" },
    });
  });
});
