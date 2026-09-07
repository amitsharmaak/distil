jest.mock("@/lib/ai/router", () => ({ generateText: jest.fn() }));
jest.mock("@/lib/ai/taxonomy", () => ({
  buildTaxonomyPromptSection: jest.fn(() => "taxonomy"),
  normalizeTags: jest.fn((tags: string[]) => tags),
}));
jest.mock("@/lib/content-strategies", () => ({ detectStrategy: jest.fn() }));

import { generateText } from "@/lib/ai/router";
import { detectStrategy } from "@/lib/content-strategies";
import { enrichContent } from "../enricher";
import type {
  ContentAnalysis,
  ContentClassification,
  ExtractedContentResult,
  RawContent,
} from "../types";

const raw: RawContent = {
  id: "raw-1",
  sourceType: "manual",
  rawBody: "body",
  url: "https://example.com/story",
  metadata: {},
  fetchedAt: "2026-01-01T00:00:00.000Z",
};
const extracted: ExtractedContentResult = {
  cleanContent: "Body",
  cleanTextContent: "Plain body",
  title: "Title",
  allLinks: [],
};
const analysis: ContentAnalysis = {
  detectedMedia: [],
  relevantLinks: [],
  entities: [],
  wordCount: 10,
  estimatedReadTimeMinutes: 1,
  informationDensityScore: 0.5,
};
const classification: ContentClassification = {
  contentType: "article",
  detectedMediaTypes: ["text"],
  language: "en",
  confidence: 1,
  isContentPage: true,
  classifiedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(generateText).mockResolvedValue('["testing"]');
});

it("leaves article summary generation to the consolidated structured flow", async () => {
  jest.mocked(detectStrategy).mockReturnValue({ generateAISummary: true } as never);

  const result = await enrichContent(raw, extracted, analysis, classification);

  expect(result.summary).toBe("");
  expect(generateText).toHaveBeenCalledTimes(1);
  expect(generateText).toHaveBeenCalledWith(expect.any(String), "auto-tag");
});

it("preserves source text for tweets", async () => {
  jest.mocked(detectStrategy).mockReturnValue({ generateAISummary: false } as never);

  const result = await enrichContent(
    { ...raw, url: "https://x.com/person/status/1" },
    { ...extracted, cleanTextContent: "Short tweet" },
    analysis,
    classification
  );

  expect(result.summary).toBe("Short tweet");
  expect(generateText).toHaveBeenCalledTimes(1);
});
