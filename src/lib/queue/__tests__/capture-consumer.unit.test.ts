jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));
jest.mock("@/lib/knowledge/capture-index", () => ({ indexCapturedItem: jest.fn() }));
jest.mock("@/lib/ai/summarize", () => ({ generateSummary: jest.fn() }));
jest.mock("@/lib/ai/classify-area", () => ({ classifyItemArea: jest.fn() }));
jest.mock("@/lib/ai/triage-capture", () => ({ createTenantCaptureTriage: jest.fn() }));
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
import { classifyItemArea } from "@/lib/ai/classify-area";
import { getTenantRepositories } from "@/lib/database";
import { indexCapturedItem } from "@/lib/knowledge/capture-index";
import { createTenantCaptureTriage } from "@/lib/ai/triage-capture";
import { createDefaultCaptureProcessor } from "@/lib/capture/worker";
import { consumeCaptureMessage, hasPriorJunkRejection } from "../capture-consumer";
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
  delete process.env.FEATURE_AREA_CLASSIFICATION;
  jest.mocked(classifyItemArea).mockResolvedValue({
    status: "classified",
    area: "work",
    confidence: 0.9,
  });
  jest.mocked(getTenantRepositories).mockResolvedValue(repositories);
  jest.mocked(indexCapturedItem).mockResolvedValue(undefined);
  jest.mocked(generateSummary).mockResolvedValue({ summary: "brief", cached: false });
});

afterAll(() => {
  delete process.env.FEATURE_CAPTURE_SUMMARY;
  delete process.env.FEATURE_AREA_CLASSIFICATION;
});

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

it("classifies the item's life area after the brief, with the same tenant context", async () => {
  await consumeCaptureMessage(message);
  await mockEnrichment?.("item-1");
  expect(classifyItemArea).toHaveBeenCalledWith(
    expect.objectContaining({ userId: message.userId, requestId: message.traceId }),
    repositories,
    "item-1"
  );
  expect(jest.mocked(generateSummary).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(classifyItemArea).mock.invocationCallOrder[0]
  );
});

it("still classifies when the brief is disabled or fails", async () => {
  process.env.FEATURE_CAPTURE_SUMMARY = "false";
  await consumeCaptureMessage(message);
  await mockEnrichment?.("item-1");
  expect(classifyItemArea).toHaveBeenCalledTimes(1);

  delete process.env.FEATURE_CAPTURE_SUMMARY;
  jest.mocked(generateSummary).mockRejectedValue(new Error("quota"));
  await consumeCaptureMessage(message);
  await mockEnrichment?.("item-2");
  expect(classifyItemArea).toHaveBeenLastCalledWith(expect.anything(), repositories, "item-2");
});

it("keeps capture enrichment successful when area classification fails", async () => {
  jest.mocked(classifyItemArea).mockRejectedValue(new Error("invalid_output"));
  await consumeCaptureMessage(message);
  await expect(mockEnrichment?.("item-1")).resolves.toBeUndefined();
  expect(generateSummary).toHaveBeenCalledTimes(1);
});

it("honours the default-on area kill switch when explicitly disabled", async () => {
  process.env.FEATURE_AREA_CLASSIFICATION = "false";
  await consumeCaptureMessage(message);
  await mockEnrichment?.("item-1");
  expect(generateSummary).toHaveBeenCalledTimes(1);
  expect(classifyItemArea).not.toHaveBeenCalled();
});

describe("capture triage wiring", () => {
  const mockTriage = jest.fn();
  const processorDependencies = () =>
    jest.mocked(createDefaultCaptureProcessor).mock.calls.at(-1)?.[0] as Parameters<
      typeof createDefaultCaptureProcessor
    >[0];

  beforeEach(() => {
    delete process.env.FEATURE_CAPTURE_TRIAGE;
    jest.mocked(createTenantCaptureTriage).mockReturnValue(mockTriage);
  });

  afterAll(() => {
    delete process.env.FEATURE_CAPTURE_TRIAGE;
  });

  it("passes tenant triage in enforcing mode by default", async () => {
    await consumeCaptureMessage(message);
    expect(createTenantCaptureTriage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: message.userId, requestId: message.traceId }),
      repositories
    );
    expect(processorDependencies().triage).toBe(mockTriage);
    expect(processorDependencies().triageMode).toBe("on");
  });

  it("passes triage in shadow mode", async () => {
    process.env.FEATURE_CAPTURE_TRIAGE = "shadow";
    await consumeCaptureMessage(message);
    expect(processorDependencies().triage).toBe(mockTriage);
    expect(processorDependencies().triageMode).toBe("shadow");
  });

  it("passes no triage dependency when the kill switch is off", async () => {
    process.env.FEATURE_CAPTURE_TRIAGE = "false";
    await consumeCaptureMessage(message);
    expect(createTenantCaptureTriage).not.toHaveBeenCalled();
    expect(processorDependencies().triage).toBeUndefined();
    expect(processorDependencies().triageMode).toBe("off");
  });

  it("finds a prior junk rejection only for another capture of the same URL", async () => {
    const list = jest.fn().mockResolvedValue([
      { id: "self", normalizedUrl: "https://a.test/x", lastErrorCode: "CONTENT_JUNK" },
      { id: "other-url", normalizedUrl: "https://a.test/y", lastErrorCode: "CONTENT_JUNK" },
      { id: "other-code", normalizedUrl: "https://a.test/x", lastErrorCode: "CONTENT_REJECTED" },
    ]);
    await expect(hasPriorJunkRejection({ list }, "https://a.test/x", "self")).resolves.toBe(false);
    expect(list).toHaveBeenCalledWith(100, ["rejected"]);

    list.mockResolvedValue([
      { id: "earlier", normalizedUrl: "https://a.test/x", lastErrorCode: "CONTENT_JUNK" },
    ]);
    await expect(hasPriorJunkRejection({ list }, "https://a.test/x", "self")).resolves.toBe(true);
  });

  it("wires the prior-rejection lookup to the tenant capture repository", async () => {
    const list = jest
      .fn()
      .mockResolvedValue([
        { id: "earlier", normalizedUrl: "https://a.test/x", lastErrorCode: "CONTENT_JUNK" },
      ]);
    jest
      .mocked(getTenantRepositories)
      .mockResolvedValue({ ...(repositories as object), captures: { list } } as never);
    await consumeCaptureMessage(message);
    await expect(
      processorDependencies().hasPriorJunkRejection?.("https://a.test/x", "self")
    ).resolves.toBe(true);
    expect(list).toHaveBeenCalledWith(100, ["rejected"]);
  });
});
