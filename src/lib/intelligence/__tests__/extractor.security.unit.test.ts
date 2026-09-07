const extractContentFromHtml = jest.fn().mockReturnValue({
  title: "Pinned article",
  byline: null,
  content: "<p>Safe content</p>",
  textContent: "Safe content",
  extractedLinks: [],
});
const extractOGFromHtml = jest.fn().mockReturnValue({
  title: "Pinned article",
  description: null,
  image: null,
  author: null,
  siteName: "Example",
});

jest.mock("@/lib/content-extractor", () => ({
  extractContent: jest.fn(() => {
    throw new Error("network extraction must not run");
  }),
  extractContentFromHtml,
}));
jest.mock("@/lib/og", () => ({
  fetchOG: jest.fn(() => {
    throw new Error("network metadata fetch must not run");
  }),
  extractOGFromHtml,
}));
jest.mock("@/lib/connectors/publishers/fetcher", () => ({ fetchArticle: jest.fn() }));
jest.mock("@/lib/connectors/publishers/registry", () => ({ findByUrl: jest.fn() }));
jest.mock("@/lib/connectors/publishers/types", () => ({
  PublisherAuthRequired: class PublisherAuthRequired extends Error {},
}));

import { extractContent } from "@/lib/intelligence/extractor";
import type { ContentClassification, RawContent } from "@/lib/intelligence/types";

describe("durable capture extraction", () => {
  it("parses the pinned response body without refetching its URL", async () => {
    const raw = {
      id: "capture-1",
      sourceType: "manual",
      url: "https://public.example.test/story",
      rawBody: `<!doctype html><html><head>
        <title>Pinned article</title>
        <meta property="og:site_name" content="Example">
      </head><body><article><h1>Pinned article</h1>
        <p>${"Safe content from the validated response. ".repeat(20)}</p>
        <img src="https://images.example.test/a.png" onerror="fetch('/secret')">
      </article></body></html>`,
      rawTextContent: "Safe content from the validated response.",
      metadata: {},
      fetchedAt: "2026-01-01T00:00:00.000Z",
    } satisfies RawContent;

    const result = await extractContent(raw, {} as ContentClassification);

    expect(extractContentFromHtml).toHaveBeenCalledWith(raw.rawBody, raw.url);
    expect(extractOGFromHtml).toHaveBeenCalledWith(raw.rawBody);
    expect(result.title).toBe("Pinned article");
    expect(result.cleanContent).toBe("<p>Safe content</p>");
  });

  it("does not expose fetched page HTML as plaintext when extraction fails", async () => {
    extractContentFromHtml.mockReturnValueOnce(null);
    extractOGFromHtml.mockReturnValueOnce({
      title: "Blocked",
      description: null,
      image: null,
      author: null,
      siteName: null,
    });
    const raw = {
      id: "capture-2",
      sourceType: "manual",
      url: "https://public.example.test/login",
      rawBody: "<html><body><form>Sign in to continue</form></body></html>",
      metadata: {},
      fetchedAt: "2026-01-01T00:00:00.000Z",
    } satisfies RawContent;

    const result = await extractContent(raw, {} as ContentClassification);

    expect(result.cleanTextContent).toBe("");
    expect(result.cleanContent).toBe("");
  });

  it("derives email plaintext from the DOM while removing executable and form chrome", async () => {
    const raw = {
      id: "capture-3",
      sourceType: "gmail",
      rawBody:
        "<html><body><script>steal()</script><nav>Menu</nav><p>Useful email prose.</p><form>Sign in</form></body></html>",
      metadata: { subject: "Newsletter" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
    } satisfies RawContent;

    const result = await extractContent(raw, {} as ContentClassification);

    expect(result.cleanTextContent.trim()).toBe("Useful email prose.");
    expect(result.cleanTextContent).not.toContain("steal");
    expect(result.cleanTextContent).not.toContain("Sign in");
  });
});
