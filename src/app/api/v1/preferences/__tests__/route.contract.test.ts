jest.mock("@/lib/auth/route-helpers", () => ({
  requireRequestSession: jest.fn(),
  requireSessionMutation: jest.fn(),
}));
jest.mock("@/lib/postgres/client", () => ({ createPostgresClient: jest.fn() }));
jest.mock("@/lib/digests/postgres-store", () => ({ PostgresDigestStore: jest.fn() }));

import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { AuthError } from "@/lib/auth/errors";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { createPostgresClient } from "@/lib/postgres/client";

import { GET, PUT } from "../route";
import { POST } from "../reset/route";

const sql = { end: jest.fn() };
const mockSession = requireRequestSession as jest.MockedFunction<typeof requireRequestSession>;
const mockMutation = requireSessionMutation as jest.MockedFunction<typeof requireSessionMutation>;
const mockClient = createPostgresClient as jest.MockedFunction<typeof createPostgresClient>;
const mockStore = PostgresDigestStore as jest.MockedClass<typeof PostgresDigestStore>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  mockClient.mockReturnValue(sql as never);
  mockStore.mockImplementation(
    () =>
      ({
        getPreferences: jest.fn().mockResolvedValue({ personalizationEnabled: true }),
        updatePreferences: jest.fn().mockImplementation(async (input) => input),
        resetPreferences: jest.fn().mockResolvedValue({
          digestEnabled: false,
          digestTimezone: "UTC",
          personalizationEnabled: true,
        }),
      }) as never
  );
});

afterAll(() => delete process.env.DATABASE_URL);

describe("Phase 2 preferences API contract", () => {
  it("keeps the GET session-protected", async () => {
    mockSession.mockRejectedValueOnce(
      new AuthError("UNAUTHORIZED", 401, "Authentication required")
    );
    const response = await GET(new Request("https://distil.example/api/v1/preferences"));
    expect(response.status).toBe(401);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("allows only explicit preference fields and uses same-origin mutations", async () => {
    mockMutation.mockResolvedValueOnce();
    const invalid = await PUT(
      new Request("http://localhost:3000/api/v1/preferences", {
        method: "PUT",
        body: JSON.stringify({ personalizationEnabled: false, ignored: true }),
      })
    );
    expect(invalid.status).toBe(400);
    expect(mockClient).not.toHaveBeenCalled();

    mockMutation.mockResolvedValueOnce();
    const valid = await PUT(
      new Request("http://localhost:3000/api/v1/preferences", {
        method: "PUT",
        body: JSON.stringify({ personalizationEnabled: false }),
      })
    );
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual({ preferences: { personalizationEnabled: false } });
  });

  it("resets personalization to the safe default through a same-origin POST", async () => {
    mockMutation.mockResolvedValueOnce();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/preferences/reset", { method: "POST" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preferences: { personalizationEnabled: true, digestEnabled: false },
    });
  });
});
