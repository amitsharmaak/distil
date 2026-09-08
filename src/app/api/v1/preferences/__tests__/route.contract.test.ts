jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { getTenantRepositories } from "@/lib/database";

import { GET, PUT } from "../route";
import { POST } from "../reset/route";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const store = {
  getPreferences: jest.fn(),
  updatePreferences: jest.fn(),
  resetPreferences: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context);
  store.getPreferences.mockResolvedValue({ personalizationEnabled: true });
  store.updatePreferences.mockImplementation(async (input) => input);
  store.resetPreferences.mockResolvedValue({
    digestEnabled: false,
    digestTimezone: "UTC",
    personalizationEnabled: true,
  });
  jest.mocked(getTenantRepositories).mockResolvedValue({ digestExperience: store } as never);
});

afterAll(() => delete process.env.DATABASE_URL);

describe("Phase 3 tenant preferences API contract", () => {
  it("keeps GET tenant-authenticated", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "Authentication required"));
    const response = await GET(new Request("https://distil.example/api/v1/preferences"));
    expect(response.status).toBe(401);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("allows only explicit fields and writes through caller-bound storage", async () => {
    const invalid = await PUT(
      new Request("http://localhost:3000/api/v1/preferences", {
        method: "PUT",
        body: JSON.stringify({ personalizationEnabled: false, ignored: true }),
      })
    );
    expect(invalid.status).toBe(400);
    expect(getTenantRepositories).not.toHaveBeenCalled();

    const valid = await PUT(
      new Request("http://localhost:3000/api/v1/preferences", {
        method: "PUT",
        body: JSON.stringify({ personalizationEnabled: false }),
      })
    );
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual({ preferences: { personalizationEnabled: false } });
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
  });

  it("resets personalization and digest settings through caller-bound storage", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/v1/preferences/reset", { method: "POST" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preferences: {
        personalizationEnabled: true,
        digestEnabled: false,
        digestTimezone: "UTC",
      },
    });
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
  });
});
