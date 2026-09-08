jest.mock("@/lib/auth/account-service", () => ({
  resolveCurrentAccount: jest.fn(),
  resolveRequestAuthContext: jest.fn(),
}));
jest.mock("@/lib/auth/neon-auth-foundation", () => ({ readNeonAuthFoundation: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { AccessDeniedError } from "@/lib/auth/account";
import { resolveCurrentAccount, resolveRequestAuthContext } from "@/lib/auth/account-service";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { getTenantRepositories } from "@/lib/database";
import { requireAllowedOrigin } from "@/lib/auth/origin";

import { GET, PATCH } from "../route";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as const;
const settings = { get: jest.fn(), set: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readNeonAuthFoundation).mockReturnValue({
    enabled: false,
    status: "disabled",
    missing: [],
  });
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context as never);
  jest.mocked(getTenantRepositories).mockResolvedValue({ settings } as never);
  settings.get.mockResolvedValue(undefined);
  settings.set.mockResolvedValue(undefined);
});

describe("Phase 3 account profile route", () => {
  it("uses only caller-bound repositories and does not cache profile reads", async () => {
    const response = await GET(new Request("https://distil.example/api/v1/account"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
    await expect(response.json()).resolves.toMatchObject({
      account: {
        userId: "11111111-1111-4111-8111-111111111111",
        timezone: "UTC",
        status: "active",
      },
    });
  });

  it("enforces same-origin mutations and rejects client-supplied account fields", async () => {
    const invalid = await PATCH(
      new Request("https://distil.example/api/v1/account", {
        method: "PATCH",
        body: JSON.stringify({ timezone: "UTC", userId: "other-user" }),
      })
    );
    expect(invalid.status).toBe(400);
    expect(getTenantRepositories).not.toHaveBeenCalled();

    const response = await PATCH(
      new Request("https://distil.example/api/v1/account", {
        method: "PATCH",
        body: JSON.stringify({ displayName: "Amit", timezone: "Asia/Kolkata" }),
      })
    );
    expect(response.status).toBe(200);
    expect(requireAllowedOrigin).toHaveBeenCalled();
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
  });

  it("hydrates only the mapped Neon owner identity when the feature is enabled", async () => {
    jest.mocked(readNeonAuthFoundation).mockReturnValue({
      enabled: true,
      status: "ready",
      missing: [],
    });
    jest.mocked(resolveCurrentAccount).mockResolvedValue({
      context,
      account: {
        userId: context.userId,
        status: "active",
        primaryEmail: "owner@example.com",
      },
      identity: { email: "provider@example.com" },
    } as never);
    settings.get.mockResolvedValueOnce(
      JSON.stringify({
        displayName: "Amit",
        timezone: "Asia/Kolkata",
        privacy: { allowPersonalization: false, allowAiProcessing: true },
        onboardingCompleted: true,
      })
    );

    const request = new Request("https://distil.example/api/v1/account");
    const response = await GET(request);
    expect(resolveCurrentAccount).toHaveBeenCalledWith(request);
    expect(resolveRequestAuthContext).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      account: {
        userId: context.userId,
        status: "active",
        email: "owner@example.com",
        displayName: "Amit",
      },
    });
  });

  it("uses the verified provider email when the account has no primary email", async () => {
    jest.mocked(readNeonAuthFoundation).mockReturnValue({
      enabled: true,
      status: "ready",
      missing: [],
    });
    jest.mocked(resolveCurrentAccount).mockResolvedValue({
      context,
      account: { userId: context.userId, status: "active" },
      identity: { email: "provider@example.com" },
    } as never);

    const response = await GET(new Request("https://distil.example/api/v1/account"));
    await expect(response.json()).resolves.toMatchObject({
      account: { email: "provider@example.com" },
    });
  });

  it("returns typed auth, malformed JSON, and profile validation errors", async () => {
    jest.mocked(readNeonAuthFoundation).mockReturnValueOnce({
      enabled: true,
      status: "ready",
      missing: [],
    });
    jest.mocked(resolveCurrentAccount).mockRejectedValueOnce(new AccessDeniedError("disabled"));
    const denied = await GET(new Request("https://distil.example/api/v1/account"));
    expect(denied.status).toBe(403);

    const malformed = await PATCH(
      new Request("https://distil.example/api/v1/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", message: "A JSON account profile is required" },
    });

    const invalidTimezone = await PATCH(
      new Request("https://distil.example/api/v1/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: "not/a-zone" }),
      })
    );
    expect(invalidTimezone.status).toBe(400);
    await expect(invalidTimezone.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", message: "Timezone must be a valid IANA timezone" },
    });
  });

  it("does not expose unexpected profile repository failures", async () => {
    jest.mocked(getTenantRepositories).mockRejectedValueOnce(new Error("private database detail"));
    const response = await GET(new Request("https://distil.example/api/v1/account"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PROCESSING_FAILED",
        message: "The request could not be completed",
      },
    });
  });
});
