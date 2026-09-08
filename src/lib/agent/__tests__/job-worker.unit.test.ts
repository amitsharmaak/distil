jest.mock("@/lib/logger", () => ({
  aiLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import {
  enqueueProactiveScan,
  enqueueTriageJob,
  processNextJob,
  registerJobHandler,
  startJobWorker,
  stopJobWorker,
} from "../job-worker";

beforeEach(() => {
  jest.clearAllMocks();
  stopJobWorker();
});

afterEach(() => {
  stopJobWorker();
  jest.useRealTimers();
});

describe("job worker", () => {
  it("fails closed when asked to process the legacy global queue", async () => {
    await expect(processNextJob("worker-1")).resolves.toBe(false);
  });

  it("rejects legacy global handler registration", () => {
    expect(() => registerJobHandler("test-object", jest.fn())).toThrow(
      "Legacy global job handlers are disabled pending tenant-scoped dequeue"
    );
  });

  it("keeps the polling shell inert until a tenant worker is available", async () => {
    jest.useFakeTimers();
    startJobWorker(100);
    startJobWorker(100);
    await jest.advanceTimersByTimeAsync(100);
    stopJobWorker();
    await jest.advanceTimersByTimeAsync(200);
  });

  it("rejects legacy convenience enqueues without tenant scope", async () => {
    await expect(enqueueTriageJob("item-1")).rejects.toThrow(
      "Tenant-scoped job enqueue is required for item-1"
    );
    await expect(enqueueProactiveScan()).rejects.toThrow("Tenant-scoped job enqueue is required");
  });
});
