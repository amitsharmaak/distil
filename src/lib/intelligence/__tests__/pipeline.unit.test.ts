jest.mock("../../database", () => ({
  getItemByNormalizedUrl: jest.fn(),
  getUserSetting: jest.fn(),
  insertItem: jest.fn(),
  insertRawContent: jest.fn(),
  updateItem: jest.fn(),
  updateItemProcessingStatus: jest.fn(),
  updateItemPriorityScore: jest.fn(),
  updateRawContentItemId: jest.fn(),
}));
// These providers are tenant-bound now. Keep the mocks to prove this legacy
// pipeline never reaches them without authenticated context and repositories.
jest.mock("../../ai/summarize", () => ({ generateSummary: jest.fn() }));
jest.mock("../../ai/embeddings", () => ({ embedItem: jest.fn() }));
jest.mock("../../connectors/publishers/types", () => ({
  PublisherAuthRequired: class PublisherAuthRequired extends Error {},
}));
jest.mock("../classifier", () => ({ classify: jest.fn() }));
jest.mock("../relevance", () => ({ checkRelevance: jest.fn() }));
jest.mock("../extractor", () => ({ extractContent: jest.fn() }));
jest.mock("../analyzer", () => ({ analyzeContent: jest.fn() }));
jest.mock("../enricher", () => ({ enrichContent: jest.fn() }));

import {
  getItemByNormalizedUrl,
  getUserSetting,
  insertItem,
  insertRawContent,
  updateItem,
  updateItemProcessingStatus,
  updateItemPriorityScore,
  updateRawContentItemId,
} from "../../database";
import { generateSummary } from "../../ai/summarize";
import { embedItem } from "../../ai/embeddings";
import { classify } from "../classifier";
import { checkRelevance } from "../relevance";
import { extractContent } from "../extractor";
import { analyzeContent } from "../analyzer";
import { enrichContent } from "../enricher";
import { buildRawContent, processContent } from "../pipeline";
import type { RawContent } from "../types";

const classification = {
  contentType: "article" as const,
  detectedMediaTypes: ["text" as const],
  language: "en",
  confidence: 0.99,
  isContentPage: true,
  classifiedAt: "2026-01-01T00:00:00.000Z",
};
const extracted = {
  cleanContent: "<p>Body</p>",
  cleanTextContent: "Body",
  title: "Article",
  author: "Author",
  publication: "Publisher",
  thumbnailUrl: "https://example.com/image.jpg",
  allLinks: [],
};
const analysis = {
  detectedMedia: [],
  relevantLinks: [],
  entities: [],
  wordCount: 100,
  estimatedReadTimeMinutes: 1,
  informationDensityScore: 0.8,
};
const enriched = {
  summary: "Summary",
  topics: ["testing"],
  priorityScore: 80,
  priority: "high" as const,
};
const raw = (overrides: Partial<RawContent> = {}): RawContent => ({
  id: "raw-1",
  sourceType: "manual",
  rawBody: "<html>Body</html>",
  url: "https://example.com/story",
  metadata: { pageTitle: "Fallback title", timestamp: "2026-01-01T00:00:00.000Z" },
  fetchedAt: "2026-01-01T00:00:01.000Z",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(insertRawContent).mockResolvedValue(undefined);
  jest.mocked(getItemByNormalizedUrl).mockResolvedValue(undefined);
  jest.mocked(getUserSetting).mockResolvedValue(undefined);
  jest.mocked(insertItem).mockImplementation(async (item) => item);
  jest.mocked(updateItem).mockResolvedValue(undefined);
  jest.mocked(updateItemProcessingStatus).mockResolvedValue(undefined);
  jest.mocked(updateItemPriorityScore).mockResolvedValue(undefined);
  jest.mocked(updateRawContentItemId).mockResolvedValue(undefined);
  jest.mocked(classify).mockResolvedValue(classification);
  jest.mocked(checkRelevance).mockResolvedValue({ accepted: true });
  jest.mocked(extractContent).mockResolvedValue(extracted);
  jest.mocked(analyzeContent).mockResolvedValue(analysis);
  jest.mocked(enrichContent).mockResolvedValue(enriched);
});

it("persists every successful stage without invoking legacy enrichment providers", async () => {
  jest
    .mocked(extractContent)
    .mockResolvedValue({ ...extracted, videoUrl: "https://video.test/v", isXArticle: true });
  const result = await processContent(raw());

  expect(result).toMatchObject({ status: "ready", itemId: "raw-1", classification, enriched });
  expect(updateItem).toHaveBeenCalledWith(
    "raw-1",
    expect.objectContaining({
      detectedMedia: [{ type: "video", platform: "twitter", embedUrl: "https://video.test/v" }],
      processingStatus: "ready",
    })
  );
  expect(generateSummary).not.toHaveBeenCalled();
  expect(embedItem).not.toHaveBeenCalled();
});

it("returns an existing ready item without running intelligence stages", async () => {
  jest
    .mocked(getItemByNormalizedUrl)
    .mockResolvedValue({ id: "existing", processingStatus: "ready" } as never);

  await expect(processContent(raw())).resolves.toEqual({
    rawContentId: "raw-1",
    itemId: "existing",
    status: "ready",
  });
  expect(updateRawContentItemId).toHaveBeenCalledWith("raw-1", "existing");
  expect(classify).not.toHaveBeenCalled();
});

it("continues an existing processing item without inserting another item", async () => {
  jest
    .mocked(getItemByNormalizedUrl)
    .mockResolvedValue({ id: "existing", processingStatus: "processing" } as never);

  const result = await processContent(raw());

  expect(result).toMatchObject({ status: "ready", itemId: "existing" });
  expect(insertItem).not.toHaveBeenCalled();
  expect(updateItemProcessingStatus).toHaveBeenCalledWith("existing", "processing");
});

it("converges on a ready item returned by an insert race", async () => {
  jest.mocked(insertItem).mockResolvedValue({ id: "winner", processingStatus: "ready" } as never);

  await expect(processContent(raw())).resolves.toEqual({
    rawContentId: "raw-1",
    itemId: "winner",
    status: "ready",
  });
  expect(updateRawContentItemId).toHaveBeenCalledWith("raw-1", "winner");
});

it("records relevance rejection with classification fallback", async () => {
  jest.mocked(classify).mockRejectedValue(new Error("classifier failed"));
  jest.mocked(checkRelevance).mockResolvedValue({ accepted: false, reason: "not relevant" });

  const result = await processContent(raw({ metadata: {} }));

  expect(result).toMatchObject({ status: "rejected", rejectionReason: "not relevant" });
  expect(result.classification).toMatchObject({ confidence: 0, isContentPage: true });
  expect(updateItemProcessingStatus).toHaveBeenLastCalledWith("raw-1", "rejected", "not relevant");
});

it("degrades extraction, analysis, and enrichment failures to deterministic fallbacks", async () => {
  jest.mocked(extractContent).mockRejectedValue(new Error("extract failed"));
  jest.mocked(analyzeContent).mockRejectedValue(new Error("analyze failed"));
  jest.mocked(enrichContent).mockRejectedValue(new Error("enrich failed"));

  const result = await processContent(
    raw({ url: undefined, metadata: { subject: "Inbox title" } })
  );

  expect(result).toMatchObject({
    status: "ready",
    extracted: { title: "Inbox title", cleanContent: "", allLinks: [] },
    analysis: { wordCount: 0, informationDensityScore: 0.5 },
    enriched: { summary: "Inbox title", priorityScore: 50, priority: "medium" },
  });
  expect(generateSummary).not.toHaveBeenCalled();
  expect(embedItem).not.toHaveBeenCalled();
});

it("turns thrown and non-Error persistence failures into rejected results", async () => {
  jest.mocked(insertRawContent).mockRejectedValueOnce(new Error("database offline"));
  await expect(processContent(raw())).resolves.toMatchObject({
    status: "rejected",
    rejectionReason: "database offline",
  });

  jest.mocked(insertRawContent).mockRejectedValueOnce("unknown failure");
  await expect(processContent(raw({ id: "raw-2" }))).resolves.toMatchObject({
    status: "rejected",
    rejectionReason: "unknown failure",
  });
  expect(updateItemProcessingStatus).toHaveBeenLastCalledWith(
    "raw-2",
    "rejected",
    "unknown failure"
  );
});

it("builds connector raw content with generated identity and optional fields", () => {
  const built = buildRawContent({
    sourceType: "browser-extension",
    rawBody: "body",
    rawTextContent: "text",
    url: "https://example.com",
    urls: ["https://example.com"],
    metadata: { userNotes: "note" },
  });
  expect(built).toMatchObject({
    sourceType: "browser-extension",
    rawBody: "body",
    rawTextContent: "text",
  });
  expect(built.id).toEqual(expect.any(String));
  expect(built.fetchedAt).toEqual(expect.any(String));
});
