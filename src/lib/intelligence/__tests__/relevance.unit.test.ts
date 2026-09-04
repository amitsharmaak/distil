import { checkRelevance } from "../relevance";
import type { ContentClassification, RawContent } from "../types";

const classification: ContentClassification = {
  contentType: "article",
  detectedMediaTypes: ["text"],
  language: "en",
  confidence: 0.9,
  isContentPage: true,
  emailCategory: "newsletter",
  classifiedAt: "2026-09-04T00:00:00.000Z",
};

function rawContent(sourceType: RawContent["sourceType"]): RawContent {
  return {
    id: "raw-1",
    sourceType,
    rawBody: "body",
    metadata: {},
    fetchedAt: "2026-09-04T00:00:00.000Z",
  };
}

describe("checkRelevance", () => {
  it("awaits the settings lookup before evaluating a Gmail category", async () => {
    const getUserSetting = jest
      .fn<Promise<string | undefined>, [string]>()
      .mockResolvedValue(JSON.stringify(["digest"]));

    await expect(
      checkRelevance(rawContent("gmail"), classification, getUserSetting)
    ).resolves.toEqual({
      accepted: false,
      reason: 'Email category "newsletter" is not in your allowed list',
    });
    expect(getUserSetting).toHaveBeenCalledWith("email_intelligence_categories");
  });

  it("does not load settings for a non-email source", async () => {
    const getUserSetting = jest.fn<Promise<string | undefined>, [string]>();

    await expect(
      checkRelevance(rawContent("manual"), classification, getUserSetting)
    ).resolves.toEqual({ accepted: true });
    expect(getUserSetting).not.toHaveBeenCalled();
  });
});
