jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { getTenantRepositories } from "@/lib/database";
import { requireAllowedOrigin } from "@/lib/auth/origin";

import { GET, PATCH } from "../route";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const settings = { get: jest.fn(), set: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FEATURE_NEON_AUTH = "false";
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context);
  jest.mocked(getTenantRepositories).mockResolvedValue({ settings } as never);
  settings.get.mockResolvedValue(undefined);
  settings.set.mockResolvedValue(undefined);
});

afterAll(() => delete process.env.FEATURE_NEON_AUTH);

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
});
