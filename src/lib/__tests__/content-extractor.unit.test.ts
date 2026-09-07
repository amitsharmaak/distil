jest.mock("@mozilla/readability", () => ({ Readability: jest.fn() }));
jest.mock("@/lib/content-sanitizer", () => ({
  sanitizeArticleHtml: (html: string) => html.replace(/<script>[\s\S]*?<\/script>/g, ""),
}));
import { Readability } from "@mozilla/readability";
import { extractContent, extractContentFromHtml } from "../content-extractor";

const mockParse = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(Readability)
    .mockImplementation(
      () => ({ parse: mockParse }) as unknown as InstanceType<typeof Readability>
    );
});

afterEach(() => {
  jest.restoreAllMocks();
});

it.each(["https://x.com/user/status/1", "https://twitter.com/user/status/1"])(
  "does not extract walled-garden URL %s",
  async (url) => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    expect(extractContentFromHtml("<p>ignored</p>", url)).toBeNull();
    await expect(extractContent(url)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  }
);

it("returns null when Readability cannot identify an article", () => {
  mockParse.mockReturnValue(null);
  expect(
    extractContentFromHtml("<html><body>navigation</body></html>", "https://example.com")
  ).toBeNull();
});

it("sanitizes content and keeps unique, labelled HTTP links capped at fifty", () => {
  const links = Array.from(
    { length: 55 },
    (_, index) => `<a href="https://example.com/${index}"> Link ${index} </a>`
  ).join("");
  mockParse.mockReturnValue({
    title: undefined,
    byline: undefined,
    content: `<article><script>alert(1)</script>${links}<a href="https://example.com/0">duplicate</a><a href="mailto:a@example.com">mail</a><a href="https://valid.test"> </a></article>`,
    textContent: undefined,
  });

  const result = extractContentFromHtml("<html></html>", "https://example.com/story");

  expect(result).toMatchObject({ title: null, byline: null });
  expect(result?.textContent).toContain("Link 0");
  expect(result?.content).not.toContain("script");
  expect(result?.extractedLinks).toHaveLength(50);
  expect(result?.extractedLinks[0]).toEqual({ text: "Link 0", url: "https://example.com/0" });
});

it("handles missing article HTML content", () => {
  mockParse.mockReturnValue({
    title: "Title",
    byline: "Writer",
    content: undefined,
    textContent: "Text",
  });
  expect(extractContentFromHtml("<html></html>", "https://example.com/missing-content")).toEqual({
    title: "Title",
    byline: "Writer",
    content: "",
    textContent: "Text",
    extractedLinks: [],
  });
});

it("returns null for an unsuccessful response", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
  await expect(extractContent("https://example.com/missing")).resolves.toBeNull();
});

it("fetches HTML with browser headers and parses the response", async () => {
  mockParse.mockReturnValue({
    title: "Fetched",
    byline: null,
    content: "<p>Body</p>",
    textContent: "Body",
  });
  const fetchSpy = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("<html>article</html>"));

  await expect(extractContent("https://example.com/article")).resolves.toMatchObject({
    title: "Fetched",
  });
  expect(fetchSpy).toHaveBeenCalledWith(
    "https://example.com/article",
    expect.objectContaining({
      headers: expect.objectContaining({ Accept: "text/html" }),
      signal: expect.any(AbortSignal),
    })
  );
});

it("returns null when the network or response body fails", async () => {
  jest.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
  await expect(extractContent("https://example.com/offline")).resolves.toBeNull();

  jest.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    text: async () => {
      throw new Error("connection terminated");
    },
  } as unknown as Response);
  await expect(extractContent("https://example.com/terminated")).resolves.toBeNull();
});
