jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));
jest.mock("@/lib/config", () => ({ config: { databaseUrl: "postgres://local/test" } }));
jest.mock("@/lib/queue/tenant-job-dispatch", () => ({
  resolveTenantJobDispatcher: jest.fn(),
}));

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AuthError } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { AREA_BACKFILL_JOB_TYPE } from "@/lib/jobs/area-backfill";
import { FakeTenantJobDispatcher } from "@/lib/queue/dispatchers";
import { resolveTenantJobDispatcher } from "@/lib/queue/tenant-job-dispatch";

import { GET, POST } from "../route";

const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as never;

const counts = {
  byArea: { personal: 1, work: 2, learning: 0, updates: 0 },
  unclassified: 4,
  corrected: 1,
};
const repositories = {
  items: { countAreas: jest.fn() },
  jobs: { enqueue: jest.fn(), listRecentByType: jest.fn() },
};

function post(body?: string) {
  return new Request("http://localhost/api/v1/areas/backfill", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    ...(body === undefined ? {} : { body }),
  });
}

describe("/api/v1/areas/backfill", () => {
  let dispatcher: FakeTenantJobDispatcher;

  beforeEach(() => {
    jest.clearAllMocks();
    dispatcher = new FakeTenantJobDispatcher();
    jest.mocked(resolveRequestAuthContext).mockResolvedValue(auth);
    jest.mocked(getTenantRepositories).mockResolvedValue(repositories as never);
    jest.mocked(resolveTenantJobDispatcher).mockResolvedValue(dispatcher);
    repositories.items.countAreas.mockResolvedValue(counts);
    repositories.jobs.listRecentByType.mockResolvedValue([]);
    repositories.jobs.enqueue.mockResolvedValue(undefined);
  });

  it("starts a run for the caller only and publishes the first batch", async () => {
    const response = await POST(post());
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({ started: true, unclassified: 4 });
    expect(getTenantRepositories).toHaveBeenCalledWith(auth);
    expect(requireAllowedOrigin).toHaveBeenCalled();
    expect(repositories.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "11111111-1111-4111-8111-111111111111",
        jobType: AREA_BACKFILL_JOB_TYPE,
      })
    );
    expect(dispatcher.messages[0].message).toMatchObject({
      userId: "11111111-1111-4111-8111-111111111111",
      jobId: body.jobId,
    });
  });

  it("accepts a batch size and rejects unknown or out-of-range fields", async () => {
    expect((await POST(post(JSON.stringify({ batchSize: 5 })))).status).toBe(202);
    expect(JSON.parse(repositories.jobs.enqueue.mock.calls[0][0].payload)).toMatchObject({
      batchSize: 5,
    });
    for (const body of ['{"batchSize": 500}', '{"userId": "someone-else"}', "not json"]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
    }
    expect(repositories.jobs.enqueue).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-origin start before touching tenant data", async () => {
    jest.mocked(requireAllowedOrigin).mockImplementationOnce(() => {
      throw new AuthError("ORIGIN_NOT_ALLOWED", 403, "Request origin is not allowed");
    });
    const response = await POST(post());
    expect(response.status).toBe(403);
    expect(resolveRequestAuthContext).not.toHaveBeenCalled();
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("requires a signed-in user for both methods", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValue(new AuthError("UNAUTHORIZED", 401, "Sign in required"));
    expect((await POST(post())).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/v1/areas/backfill"))).status).toBe(401);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("reports the caller's counts and runs, and no content", async () => {
    const response = await GET(new Request("http://localhost/api/v1/areas/backfill"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ counts, runs: [] });
    expect(getTenantRepositories).toHaveBeenCalledWith(auth);
  });
});
