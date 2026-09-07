jest.mock("@/lib/auth/route-helpers", () => ({
  requireRequestSession: jest.fn(),
  requireSessionMutation: jest.fn(),
}));
jest.mock("@/lib/postgres/client", () => ({ createPostgresClient: jest.fn() }));
jest.mock("@/lib/digests/postgres-store", () => ({ PostgresDigestStore: jest.fn() }));

import { AuthError } from "@/lib/auth/errors";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { createPostgresClient } from "@/lib/postgres/client";

import { GET } from "../route";
import { PATCH } from "../preferences/route";
import { POST } from "../run/route";

const sql = { end: jest.fn() };
const mockSession = requireRequestSession as jest.MockedFunction<typeof requireRequestSession>;
const mockMutation = requireSessionMutation as jest.MockedFunction<typeof requireSessionMutation>;
const mockClient = createPostgresClient as jest.MockedFunction<typeof createPostgresClient>;
const mockStore = PostgresDigestStore as jest.MockedClass<typeof PostgresDigestStore>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.FEATURE_DIGESTS = "true";
  mockClient.mockReturnValue(sql as never);
  mockStore.mockImplementation(
    () =>
      ({
        listDigests: jest.fn().mockResolvedValue([]),
        getPreferences: jest.fn().mockResolvedValue({ digestEnabled: true, digestTimezone: "UTC" }),
        listPriorityCandidates: jest.fn().mockResolvedValue([]),
        listResurfacedCandidates: jest.fn().mockResolvedValue([]),
        findDigest: jest.fn().mockResolvedValue(undefined),
        createDigest: jest.fn().mockImplementation(async (digest) => digest),
        updatePreferences: jest
          .fn()
          .mockResolvedValue({ digestEnabled: true, digestTimezone: "UTC" }),
      }) as never
  );
});

afterAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.FEATURE_DIGESTS;
});

describe("Phase 2 digest API contract", () => {
  it("authenticates before opening PostgreSQL for digest reads", async () => {
    mockSession.mockRejectedValueOnce(
      new AuthError("UNAUTHORIZED", 401, "Authentication required")
    );
    const response = await GET(new Request("https://distil.example/api/v1/digests"));
    expect(response.status).toBe(401);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("uses a strict body allowlist before running a digest", async () => {
    mockMutation.mockResolvedValueOnce();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/digests/run", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "safe", unexpected: true }),
      })
    );
    expect(response.status).toBe(400);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("requires same-origin session mutations and validates timezones", async () => {
    mockMutation.mockResolvedValueOnce();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/digests/preferences", {
        method: "PATCH",
        body: JSON.stringify({ digestTimezone: "not-a-timezone" }),
      })
    );
    expect(response.status).toBe(400);
    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("keeps manual digest execution off until the server feature is enabled", async () => {
    delete process.env.FEATURE_DIGESTS;
    mockMutation.mockResolvedValueOnce();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/digests/run", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "safe" }),
      })
    );
    expect(response.status).toBe(503);
    expect(mockClient).not.toHaveBeenCalled();
  });
});
