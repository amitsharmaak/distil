import { applyPrivateApiCacheControl } from "../private-cache";

describe("private API cache policy", () => {
  it("overrides cacheable headers for every tenant v1 response", () => {
    const response = new Response(null, {
      headers: { "cache-control": "public, max-age=60" },
    });

    expect(applyPrivateApiCacheControl("/api/v1/feed", response)).toBe(response);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not change public or infrastructure responses", () => {
    const response = new Response(null, {
      headers: { "cache-control": "public, max-age=60" },
    });

    applyPrivateApiCacheControl("/api/health", response);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });
});
