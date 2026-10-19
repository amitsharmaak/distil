import { createYouTubeFetch } from "../youtube-fetch";

describe("createYouTubeFetch", () => {
  it("uses the global fetch when no proxy is configured", async () => {
    await expect(createYouTubeFetch("")).resolves.toBe(fetch);
  });

  it("returns a separate, proxied fetch when a proxy URL is set", async () => {
    const proxied = await createYouTubeFetch("http://user:secret@proxy.example:8080");
    expect(proxied).not.toBe(fetch);
    expect(typeof proxied).toBe("function");
  });
});
