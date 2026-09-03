/**
 * Unit tests for src/lib/og.ts — Open Graph metadata fetcher.
 *
 * All network calls are mocked via jest.spyOn(global, "fetch") so these
 * tests run offline and are deterministic.
 */

import { fetchOG } from "../og";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a minimal mock Response with the given HTML body. */
function mockResponse(html: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  } as unknown as Response;
}

/** Builds a full HTML page with common meta tags for testing. */
function buildHtml({
  ogTitle,
  ogDescription,
  ogImage,
  ogSiteName,
  articleAuthor,
  metaAuthor,
  metaDescription,
  titleTag,
}: {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogSiteName?: string;
  articleAuthor?: string;
  metaAuthor?: string;
  metaDescription?: string;
  titleTag?: string;
} = {}): string {
  const metas = [
    ogTitle ? `<meta property="og:title" content="${ogTitle}">` : "",
    ogDescription ? `<meta property="og:description" content="${ogDescription}">` : "",
    ogImage ? `<meta property="og:image" content="${ogImage}">` : "",
    ogSiteName ? `<meta property="og:site_name" content="${ogSiteName}">` : "",
    articleAuthor ? `<meta property="article:author" content="${articleAuthor}">` : "",
    metaAuthor ? `<meta name="author" content="${metaAuthor}">` : "",
    metaDescription ? `<meta name="description" content="${metaDescription}">` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const title = titleTag ? `<title>${titleTag}</title>` : "";

  return `<!DOCTYPE html><html><head>${metas}${title}</head><body></body></html>`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchOG", () => {
  // Spy on the global fetch so we can control responses without real HTTP.
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("extracts all OG fields from a well-formed page", async () => {
    const html = buildHtml({
      ogTitle: "My Article Title",
      ogDescription: "A great article about something.",
      ogImage: "https://example.com/image.jpg",
      ogSiteName: "Example Blog",
      articleAuthor: "Jane Doe",
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(html));

    const result = await fetchOG("https://example.com/article");

    expect(result.title).toBe("My Article Title");
    expect(result.description).toBe("A great article about something.");
    expect(result.image).toBe("https://example.com/image.jpg");
    expect(result.siteName).toBe("Example Blog");
    expect(result.author).toBe("Jane Doe");
  });

  it("falls back to <title> tag when og:title is missing", async () => {
    const html = buildHtml({ titleTag: "Fallback Title" });
    fetchSpy.mockResolvedValueOnce(mockResponse(html));

    const result = await fetchOG("https://example.com");

    expect(result.title).toBe("Fallback Title");
  });

  it("falls back to meta description when og:description is missing", async () => {
    const html = buildHtml({ metaDescription: "Standard meta description" });
    fetchSpy.mockResolvedValueOnce(mockResponse(html));

    const result = await fetchOG("https://example.com");

    expect(result.description).toBe("Standard meta description");
  });

  it("falls back to meta author when article:author is missing", async () => {
    const html = buildHtml({ metaAuthor: "John Smith" });
    fetchSpy.mockResolvedValueOnce(mockResponse(html));

    const result = await fetchOG("https://example.com");

    expect(result.author).toBe("John Smith");
  });

  it("handles reversed attribute order (content before property)", async () => {
    // Some sites emit `content` before `property` in the meta tag.
    const html = `<html><head>
      <meta content="Reversed Title" property="og:title">
      <meta content="Reversed Description" property="og:description">
    </head></html>`;
    fetchSpy.mockResolvedValueOnce(mockResponse(html));

    const result = await fetchOG("https://example.com");

    expect(result.title).toBe("Reversed Title");
    expect(result.description).toBe("Reversed Description");
  });

  // ── Null / empty cases ─────────────────────────────────────────────────────

  it("returns all nulls for a page with no meta tags", async () => {
    const html = "<html><head></head><body></body></html>";
    fetchSpy.mockResolvedValueOnce(mockResponse(html));

    const result = await fetchOG("https://example.com");

    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      author: null,
      siteName: null,
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it("returns all nulls on non-OK HTTP response (404)", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse("Not Found", 404));

    const result = await fetchOG("https://example.com/missing");

    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      author: null,
      siteName: null,
    });
  });

  it("returns all nulls on non-OK HTTP response (500)", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse("Server Error", 500));

    const result = await fetchOG("https://example.com/broken");

    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      author: null,
      siteName: null,
    });
  });

  it("returns all nulls when fetch throws a network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network failure"));

    const result = await fetchOG("https://unreachable.example.com");

    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      author: null,
      siteName: null,
    });
  });

  it("returns all nulls when fetch is aborted (timeout)", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    fetchSpy.mockRejectedValueOnce(abortError);

    const result = await fetchOG("https://slow.example.com");

    expect(result).toEqual({
      title: null,
      description: null,
      image: null,
      author: null,
      siteName: null,
    });
  });
});
