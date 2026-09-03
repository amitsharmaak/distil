import {
  FIXTURE_PRIVATE_ADDRESS,
  FIXTURE_PRIVATE_HOSTNAME,
  FIXTURE_PUBLIC_ADDRESS,
  FIXTURE_PUBLIC_HOSTNAME,
  startArticleFixtureServer,
} from "../support/fixture-server";

describe("article fixture server", () => {
  it("serves articles, canonical metadata, statuses, and non-content", async () => {
    const server = await startArticleFixtureServer({
      oversizedResponseBytes: 1_024,
    });

    try {
      const [article, canonical, nonContent, rateLimited, oversized] = await Promise.all([
        fetch(server.url("/article")),
        fetch(server.url("/article/canonical")),
        fetch(server.url("/non-content")),
        fetch(server.url("/status/429")),
        fetch(server.url("/article/oversized")),
      ]);

      expect(await article.text()).toContain("local-first capture");
      expect(await canonical.text()).toContain('rel="canonical"');
      expect(nonContent.headers.get("content-type")).toBe("application/pdf");
      expect(rateLimited.status).toBe(429);
      expect(rateLimited.headers.get("retry-after")).toBe("1");
      expect((await oversized.text()).length).toBe(1_024);
    } finally {
      await server.close();
    }
  });

  it("models redirects, loops, delays, connection termination, and DNS rebinding", async () => {
    const server = await startArticleFixtureServer({ slowResponseMs: 10 });

    try {
      const redirected = await fetch(server.url("/redirect"));
      expect(redirected.url).toBe(server.url("/article"));

      await expect(fetch(server.url("/redirect-loop/a"), { redirect: "follow" })).rejects.toThrow();
      await expect(fetch(server.url("/connection-close"))).rejects.toThrow();

      const start = Date.now();
      expect((await fetch(server.url("/slow"))).status).toBe(200);
      expect(Date.now() - start).toBeGreaterThanOrEqual(5);

      await expect(server.lookup(FIXTURE_PUBLIC_HOSTNAME)).resolves.toEqual({
        address: FIXTURE_PUBLIC_ADDRESS,
        family: 4,
      });
      await expect(server.lookup(FIXTURE_PRIVATE_HOSTNAME)).resolves.toEqual({
        address: FIXTURE_PRIVATE_ADDRESS,
        family: 4,
      });

      const response = await fetch(server.url("/redirect/public-to-private"), {
        redirect: "manual",
      });
      expect(response.headers.get("location")).toBe(server.privateUrl("/article"));
    } finally {
      await server.close();
    }
  });

  it.each([400, 404, 500])("serves an explicit %i response", async (status) => {
    const server = await startArticleFixtureServer();

    try {
      expect((await fetch(server.url(`/status/${status}`))).status).toBe(status);
    } finally {
      await server.close();
    }
  });
});
