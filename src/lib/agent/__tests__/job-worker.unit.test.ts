jest.mock("@/lib/database", () => ({
  completeJob: jest.fn().mockResolvedValue(undefined),
  dequeueJob: jest.fn(),
  enqueueJob: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/logger", () => ({
  aiLogger: { error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/phase2/feature-flags", () => ({
  readPhase2FeatureFlags: jest.fn(() => ({ digests: false })),
}));

import { completeJob, dequeueJob, enqueueJob } from "@/lib/database";
import {
  enqueueProactiveScan,
  enqueueTriageJob,
  processNextJob,
  registerJobHandler,
  startJobWorker,
  stopJobWorker,
} from "../job-worker";

const dequeue = jest.mocked(dequeueJob);
const complete = jest.mocked(completeJob);

beforeEach(() => {
  jest.clearAllMocks();
  dequeue.mockResolvedValue(undefined);
  stopJobWorker();
});

afterEach(() => {
  stopJobWorker();
  jest.useRealTimers();
});

describe("job worker", () => {
  it("returns false when the queue is empty", async () => {
    await expect(processNextJob("worker-1")).resolves.toBe(false);
    expect(dequeue).toHaveBeenCalledWith("worker-1");
  });

  it("completes registered jobs with object and JSON payloads", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerJobHandler("test-object", handler);
    dequeue.mockResolvedValueOnce({ id: "job-1", job_type: "test-object", payload: { ok: true } });
    await expect(processNextJob()).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith({ ok: true });
    expect(complete).toHaveBeenCalledWith("job-1");

    dequeue.mockResolvedValueOnce({
      id: "job-2",
      job_type: "test-object",
      payload: '{"ok":false}',
    });
    await expect(processNextJob()).resolves.toBe(true);
    expect(handler).toHaveBeenLastCalledWith({ ok: false });
    expect(complete).toHaveBeenLastCalledWith("job-2");
  });

  it("completes unknown and malformed jobs with useful errors", async () => {
    dequeue.mockResolvedValueOnce({ id: "unknown", job_type: "missing", payload: "{}" });
    await expect(processNextJob()).resolves.toBe(true);
    expect(complete).toHaveBeenCalledWith("unknown", "No handler for job type: missing");

    registerJobHandler("bad-json", jest.fn());
    dequeue.mockResolvedValueOnce({ id: "bad-json", job_type: "bad-json", payload: "not-json" });
    await expect(processNextJob()).resolves.toBe(true);
    expect(complete).toHaveBeenCalledWith("bad-json", expect.stringContaining("Unexpected token"));

    const handler = jest.fn().mockResolvedValue(undefined);
    registerJobHandler("array-payload", handler);
    dequeue.mockResolvedValueOnce({ id: "array", job_type: "array-payload", payload: "[]" });
    await expect(processNextJob()).resolves.toBe(true);
    expect(complete).toHaveBeenCalledWith("array", "Job payload must be a JSON object");
  });

  it("marks handler failures complete without crashing the worker", async () => {
    registerJobHandler("fails", jest.fn().mockRejectedValue(new Error("handler failed")));
    dequeue.mockResolvedValueOnce({ id: "failed", job_type: "fails", payload: undefined });
    await expect(processNextJob()).resolves.toBe(true);
    expect(complete).toHaveBeenCalledWith("failed", "handler failed");

    registerJobHandler("fails-string", jest.fn().mockRejectedValue("string failure"));
    dequeue.mockResolvedValueOnce({ id: "failed-string", job_type: "fails-string", payload: {} });
    await expect(processNextJob()).resolves.toBe(true);
    expect(complete).toHaveBeenCalledWith("failed-string", "string failure");
  });

  it("starts polling once, drains jobs, and stops polling", async () => {
    jest.useFakeTimers();
    dequeue.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    startJobWorker(100);
    startJobWorker(100);
    await jest.advanceTimersByTimeAsync(100);
    expect(dequeue).toHaveBeenCalled();
    stopJobWorker();
    const calls = dequeue.mock.calls.length;
    await jest.advanceTimersByTimeAsync(200);
    expect(dequeue).toHaveBeenCalledTimes(calls);
  });

  it("enqueues convenience jobs", async () => {
    await enqueueTriageJob("item-1");
    await enqueueProactiveScan();
    expect(enqueueJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        jobType: "triage",
        payload: JSON.stringify({ itemId: "item-1" }),
        priority: 5,
      })
    );
    expect(enqueueJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ jobType: "proactive_research_scan", payload: "{}", priority: 1 })
    );
  });
});
