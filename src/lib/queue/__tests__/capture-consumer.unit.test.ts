jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));
jest.mock("@/lib/knowledge/capture-index", () => ({ indexCapturedItem: jest.fn() }));
jest.mock("@/lib/ai/summarize", () => ({ generateSummary: jest.fn() }));
jest.mock("@/lib/queue/consumer", () => ({
  createCaptureQueueConsumer: jest.fn(() => jest.fn().mockResolvedValue(undefined)),
}));

let mockEnrichment: ((itemId: string) => Promise<void>) | undefined;
jest.mock("@/lib/capture/worker", () => ({
  createDefaultCaptureProcessor: jest.fn((dependencies) => {
    mockEnrichment = dependencies.enqueueEnrichment;
    return jest.fn();
  }),
  CaptureWorker: jest.fn(),
}));

import { generateSummary } from "@/lib/ai/summarize";
import { getTenantRepositories } from "@/lib/database";
import { indexCapturedItem } from "@/lib/knowledge/capture-index";
import { consumeCaptureMessage } from "../capture-consumer";
import type { CaptureQueueMessageV2 } from "@/lib/contracts/tenant-jobs";

const message = {
  version: 2 as const,
  userId: "10000000-0000-4000-8000-000000000001",
  captureId: "20000000-0000-4000-8000-000000000001",
  traceId: "30000000-0000-4000-8000-000000000001",
} as CaptureQueueMessageV2;
const repositories = { captures: {}, items: {}, rawContent: {}, agent: {} } as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockEnrichment = undefined;
  delete process.env.FEATURE_CAPTURE_SUMMARY;
  jest.mocked(getTenantRepositories).mockResolvedValue(repositories);
  jest.mocked(indexCapturedItem).mockResolvedValue(undefined);
  jest.mocked(generateSummary).mockResolvedValue({ summary: "brief", cached: false });
});

afterAll(() => delete process.env.FEATURE_CAPTURE_SUMMARY);

it("indexes and then generates one cached brief through the shared consumer hook", async () => {
  await consumeCaptureMessage(message);
  await mockEnrichment?.("item-1");
  expect(indexCapturedItem).toHaveBeenCalledTimes(1);
  expect(generateSummary).toHaveBeenCalledWith(
    expect.objectContaining({ userId: message.userId, requestId: message.traceId }),
    repositories,
    "item-1",
    { length: "brief" }
  );
  expect(jest.mocked(indexCapturedItem).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(generateSummary).mock.invocationCallOrder[0]
  );
});

it("keeps capture enrichment successful when summary generation fails", async () => {
  jest.mocked(generateSummary).mockRejectedValue(new Error("quota"));
  await consumeCaptureMessage(message);
  await expect(mockEnrichment?.("item-1")).resolves.toBeUndefined();
  expect(indexCapturedItem).toHaveBeenCalledTimes(1);
});

it("honours the default-on kill switch when explicitly disabled", async () => {
  process.env.FEATURE_CAPTURE_SUMMARY = "false";
  await consumeCaptureMessage(message);
  await mockEnrichment?.("item-1");
  expect(indexCapturedItem).toHaveBeenCalledTimes(1);
  expect(generateSummary).not.toHaveBeenCalled();
});
