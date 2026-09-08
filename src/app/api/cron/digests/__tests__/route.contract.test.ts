jest.mock("@/lib/database", () => ({
  getControlPlaneRepositories: jest.fn(),
  getTenantRepositories: jest.fn(),
}));
jest.mock("@/lib/digests/runtime", () => ({ enqueueDigestRuntimeJob: jest.fn() }));

import { getControlPlaneRepositories, getTenantRepositories } from "@/lib/database";
import { enqueueDigestRuntimeJob } from "@/lib/digests/runtime";

import { GET } from "../route";

const alphaUserId = "11111111-1111-4111-8111-111111111111";
const betaUserId = "22222222-2222-4222-8222-222222222222";
const enqueue = jest.fn();
const getPreferences = jest.fn();
const jobs = { enqueue: jest.fn() };

function request(): Request {
  return new Request("https://distil.example/api/cron/digests", {
    headers: { authorization: "Bearer cron-test-secret" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.DATABASE_CONTROL_PLANE_URL = "postgres://control.example/distil";
  process.env.DISTIL_SYSTEM_ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  process.env.FEATURE_DIGESTS = "true";
  jest.mocked(getControlPlaneRepositories).mockResolvedValue({
    accounts: {
      listActiveUserIds: jest
        .fn()
        .mockResolvedValueOnce([alphaUserId, betaUserId])
        .mockResolvedValue([]),
    },
  } as never);
  getPreferences.mockResolvedValue({
    digestEnabled: true,
    digestTimezone: "UTC",
    personalizationEnabled: true,
    updatedAt: "2026-09-07T00:00:00.000Z",
  });
  enqueue.mockImplementation(async (job) => job);
  jest.mocked(getTenantRepositories).mockResolvedValue({
    digestExperience: { getPreferences, enqueue },
    jobs,
  } as never);
  jest.mocked(enqueueDigestRuntimeJob).mockResolvedValue();
});

afterAll(() => {
  delete process.env.CRON_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_CONTROL_PLANE_URL;
  delete process.env.DISTIL_SYSTEM_ACTOR_ID;
  delete process.env.FEATURE_DIGESTS;
});

describe("digest cron tenant contract", () => {
  it("rejects unauthenticated requests before control-plane access", async () => {
    const response = await GET(new Request("https://distil.example/api/cron/digests"));

    expect(response.status).toBe(401);
    expect(getControlPlaneRepositories).not.toHaveBeenCalled();
  });

  it("fans out opaque user ids and creates tenant-distinct local-date jobs", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enqueued: 2, scanned: 2 });
    const contexts = jest.mocked(getTenantRepositories).mock.calls.map(([context]) => context);
    expect(contexts.map((context) => context.userId)).toEqual([alphaUserId, betaUserId]);
    expect(enqueueDigestRuntimeJob).toHaveBeenCalledTimes(2);
    const runtimeCalls = jest.mocked(enqueueDigestRuntimeJob).mock.calls;
    expect(runtimeCalls[0]?.[0].userId).toBe(alphaUserId);
    expect(runtimeCalls[1]?.[0].userId).toBe(betaUserId);
    expect(runtimeCalls[0]?.[2].localDate).toBe(runtimeCalls[1]?.[2].localDate);
    expect(runtimeCalls[0]?.[2].idempotencyKey).not.toBe(runtimeCalls[1]?.[2].idempotencyKey);
  });

  it("does not access storage while disabled or unconfigured", async () => {
    delete process.env.FEATURE_DIGESTS;
    const disabled = await GET(request());
    expect(disabled.status).toBe(200);
    await expect(disabled.json()).resolves.toMatchObject({
      enqueued: false,
      reason: "FEATURE_DISABLED",
    });
    expect(getControlPlaneRepositories).not.toHaveBeenCalled();

    process.env.FEATURE_DIGESTS = "true";
    delete process.env.DATABASE_URL;
    const unconfigured = await GET(request());
    expect(unconfigured.status).toBe(503);
    expect(getControlPlaneRepositories).not.toHaveBeenCalled();
  });

  it("returns a safe failure when one tenant enqueue fails", async () => {
    getPreferences.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "PROCESSING_FAILED" } });
  });
});
