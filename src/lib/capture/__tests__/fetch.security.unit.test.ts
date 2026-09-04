import { fetchArticle } from "../fetch";
import { publicDns } from "./fixtures";

function response(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
}

describe("safe article fetch", () => {
  it("returns supported article content", async () => {
    const fetch = jest.fn().mockResolvedValue(response("<article>Hello</article>"));
    await expect(
      fetchArticle("https://example.com/a", { fetch, resolve: publicDns })
    ).resolves.toMatchObject({
      url: "https://example.com/a",
      body: "<article>Hello</article>",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("validates every redirect and blocks public-to-private redirects", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(response("", 302, { location: "http://127.0.0.1/admin" }));
    await expect(
      fetchArticle("https://example.com", { fetch, resolve: publicDns })
    ).rejects.toMatchObject({
      code: "UNSAFE_URL",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows a validated relative redirect", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response("", 302, { location: "/final" }))
      .mockResolvedValueOnce(response("article"));
    await expect(
      fetchArticle("https://example.com/start", { fetch, resolve: publicDns })
    ).resolves.toMatchObject({ url: "https://example.com/final", body: "article" });
  });

  it("rejects redirects without a location and chains beyond the maximum", async () => {
    await expect(
      fetchArticle("https://example.com", {
        fetch: jest.fn().mockResolvedValue(response("", 302)),
        resolve: publicDns,
      })
    ).rejects.toMatchObject({ code: "INVALID_REDIRECT" });
    let redirect = 0;
    await expect(
      fetchArticle("https://example.com/0", {
        fetch: jest.fn(() =>
          Promise.resolve(response("", 302, { location: `/${(redirect += 1)}` }))
        ),
        resolve: publicDns,
        maxRedirects: 1,
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
  });

  it("detects redirect loops", async () => {
    const fetch = jest.fn().mockResolvedValue(response("", 302, { location: "/same" }));
    await expect(
      fetchArticle("https://example.com/same", { fetch, resolve: publicDns })
    ).rejects.toMatchObject({
      code: "REDIRECT_LOOP",
      kind: "terminal",
    });
  });

  test.each([408, 429, 500, 503])("classifies HTTP %s as transient", async (status) => {
    await expect(
      fetchArticle("https://example.com", {
        fetch: jest.fn().mockResolvedValue(response("error", status)),
        resolve: publicDns,
      })
    ).rejects.toMatchObject({ kind: "transient", code: `UPSTREAM_${status}` });
  });

  test.each([400, 401, 403, 404, 422])(
    "classifies definitive HTTP %s as terminal",
    async (status) => {
      await expect(
        fetchArticle("https://example.com", {
          fetch: jest.fn().mockResolvedValue(response("error", status)),
          resolve: publicDns,
        })
      ).rejects.toMatchObject({ kind: "terminal", code: `UPSTREAM_${status}` });
    }
  );

  it("classifies timeouts as transient", async () => {
    const fetch = jest.fn(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    await expect(
      fetchArticle("https://example.com", {
        fetch: fetch as typeof globalThis.fetch,
        resolve: publicDns,
        timeoutMs: 1,
      })
    ).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", kind: "transient" });
  });

  it("classifies connection termination as transient", async () => {
    await expect(
      fetchArticle("https://example.com", {
        fetch: jest.fn().mockRejectedValue(new Error("socket closed")),
        resolve: publicDns,
      })
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", kind: "transient" });
  });

  it("rejects oversized declared content", async () => {
    await expect(
      fetchArticle("https://example.com", {
        fetch: jest.fn().mockResolvedValue(response("body", 200, { "content-length": "101" })),
        resolve: publicDns,
        maxBytes: 100,
      })
    ).rejects.toMatchObject({ code: "CONTENT_TOO_LARGE", kind: "rejected" });
  });

  it("stops streaming content after the maximum byte count", async () => {
    await expect(
      fetchArticle("https://example.com", {
        fetch: jest.fn().mockResolvedValue(response("123456")),
        resolve: publicDns,
        maxBytes: 5,
      })
    ).rejects.toMatchObject({ code: "CONTENT_TOO_LARGE" });
  });

  it("rejects unsupported and empty content", async () => {
    await expect(
      fetchArticle("https://example.com", {
        fetch: jest
          .fn()
          .mockResolvedValue(response("binary", 200, { "content-type": "application/pdf" })),
        resolve: publicDns,
      })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONTENT" });
    await expect(
      fetchArticle("https://example.com", {
        fetch: jest.fn().mockResolvedValue(response("   ")),
        resolve: publicDns,
      })
    ).rejects.toMatchObject({ code: "EMPTY_CONTENT" });
  });
});
