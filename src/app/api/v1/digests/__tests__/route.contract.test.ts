jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { getTenantRepositories } from "@/lib/database";

import { GET } from "../route";
import { PATCH } from "../preferences/route";
import { POST } from "../run/route";

const context = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;
const store = {
  listDigests: jest.fn(),
  getPreferences: jest.fn(),
  listPriorityCandidates: jest.fn(),
  listResurfacedCandidates: jest.fn(),
  findDigest: jest.fn(),
  createDigest: jest.fn(),
  dismissDigest: jest.fn(),
  dismissDigestItem: jest.fn(),
  updatePreferences: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.FEATURE_DIGESTS = "true";
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context);
  store.listDigests.mockResolvedValue([]);
  store.getPreferences.mockResolvedValue({ digestEnabled: true, digestTimezone: "UTC" });
  store.listPriorityCandidates.mockResolvedValue([]);
  store.listResurfacedCandidates.mockResolvedValue([]);
  store.findDigest.mockResolvedValue(undefined);
  store.createDigest.mockImplementation(async (digest) => digest);
  store.dismissDigest.mockImplementation(async (digestId) => ({ id: digestId }));
  store.dismissDigestItem.mockResolvedValue({
    digestRunId: "digest-1",
    itemId: "item-1",
    dismissedAt: "2026-09-07T05:00:00.000Z",
  });
  store.updatePreferences.mockResolvedValue({ digestEnabled: true, digestTimezone: "UTC" });
  jest.mocked(getTenantRepositories).mockResolvedValue({ digestExperience: store } as never);
});

afterAll(() => {
  delete process.env.DATABASE_URL;
  delete process.env.FEATURE_DIGESTS;
});

describe("Phase 3 tenant digest API contract", () => {
  it("authenticates before resolving tenant storage for digest reads", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValueOnce(new AuthError("UNAUTHORIZED", 401, "Authentication required"));
    const response = await GET(new Request("https://distil.example/api/v1/digests"));
    expect(response.status).toBe(401);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("uses a strict body allowlist before running a digest", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/v1/digests/run", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "safe", unexpected: true }),
      })
    );
    expect(response.status).toBe(400);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("requires a valid timezone before resolving tenant storage", async () => {
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/digests/preferences", {
        method: "PATCH",
        body: JSON.stringify({ digestTimezone: "not-a-timezone" }),
      })
    );
    expect(response.status).toBe(400);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("keeps manual digest execution off until the feature is enabled", async () => {
    delete process.env.FEATURE_DIGESTS;
    const response = await POST(
      new Request("http://localhost:3000/api/v1/digests/run", {
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "safe" }),
      })
    );
    expect(response.status).toBe(503);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("persists an item dismissal through the caller-bound store", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/v1/digests/run", {
        method: "POST",
        body: JSON.stringify({ action: "dismiss_item", digestId: "digest-1", itemId: "item-1" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: { digestRunId: "digest-1", itemId: "item-1", dismissedAt: expect.any(String) },
    });
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
    expect(store.dismissDigestItem).toHaveBeenCalledWith("digest-1", "item-1", expect.any(String));
  });

  it("returns persisted digests from the tenant repository", async () => {
    const response = await GET(new Request("http://localhost:3000/api/v1/digests?limit=1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ digests: [] });
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
    expect(store.listDigests).toHaveBeenCalledWith(1);
  });

  it("returns the PostgreSQL requirement before resolving repositories", async () => {
    delete process.env.DATABASE_URL;
    const response = await GET(new Request("http://localhost:3000/api/v1/digests"));

    expect(response.status).toBe(503);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });
});
