jest.mock("@/lib/postgres/client", () => ({ createPostgresClient: jest.fn() }));
jest.mock("@/lib/digests/postgres-store", () => ({ PostgresDigestStore: jest.fn() }));
jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));
jest.mock("@/lib/digests/runtime", () => ({ enqueueDigestRuntimeJob: jest.fn() }));

import { getRepositorySet } from "@/lib/database";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { enqueueDigestRuntimeJob } from "@/lib/digests/runtime";
import { createPostgresClient } from "@/lib/postgres/client";

import { GET } from "../route";

const sql = { end: jest.fn() };
const job = {
  id: "ledger-id",
  localDate: "2026-09-07",
  idempotencyKey: "digest:2026-09-07",
  status: "queued" as const,
  requestedBy: "cron" as const,
  createdAt: "2026-09-07T02:00:00.000Z",
};
const mockClient = createPostgresClient as jest.MockedFunction<typeof createPostgresClient>;
const mockStore = PostgresDigestStore as jest.MockedClass<typeof PostgresDigestStore>;
const mockRepositories = getRepositorySet as jest.MockedFunction<typeof getRepositorySet>;
const mockRuntimeEnqueue = enqueueDigestRuntimeJob as jest.MockedFunction<
  typeof enqueueDigestRuntimeJob
>;

function request(): Request {
  return new Request("https://distil.example/api/cron/digests", {
    headers: { authorization: "Bearer cron-test-secret" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = "cron-test-secret";
  process.env.DATABASE_URL = "postgres://test.example/distil";
  process.env.FEATURE_DIGESTS = "true";
  mockClient.mockReturnValue(sql as never);
  mockStore.mockImplementation(
    () =>
      ({
        getPreferences: jest.fn().mockResolvedValue({
          digestEnabled: true,
          digestTimezone: "UTC",
          personalizationEnabled: true,
          updatedAt: "2026-09-07T00:00:00.000Z",
        }),
        enqueue: jest.fn().mockResolvedValue(job),
      }) as never
  );
  mockRepositories.mockResolvedValue({ jobs: { enqueue: jest.fn() } } as never);
  mockRuntimeEnqueue.mockResolvedValue();
});

afterAll(() => {
  delete process.env.CRON_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.FEATURE_DIGESTS;
});

describe("digest cron contract", () => {
  it("rejects unauthenticated requests before opening PostgreSQL", async () => {
    const response = await GET(new Request("https://distil.example/api/cron/digests"));

    expect(response.status).toBe(401);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("keeps concurrent cron retries on the same durable local-date job", async () => {
    const [first, second] = await Promise.all([GET(request()), GET(request())]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockRuntimeEnqueue).toHaveBeenCalledTimes(2);
    expect(mockRuntimeEnqueue.mock.calls[0][1]).toMatchObject({
      localDate: job.localDate,
      idempotencyKey: job.idempotencyKey,
    });
    expect(mockRuntimeEnqueue.mock.calls[1][1]).toEqual(mockRuntimeEnqueue.mock.calls[0][1]);
  });
});
