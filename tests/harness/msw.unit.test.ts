import { HttpResponse, http } from "msw";
import { startArticleFixtureServer } from "../support/fixture-server";
import { externalServiceMockServer } from "../support/msw-jest";
import { createLocalPassthroughHandlers } from "../support/msw";

describe("strict MSW server", () => {
  it("serves declared mocks", async () => {
    externalServiceMockServer.use(
      http.get("https://mocked.example.test/value", () => HttpResponse.json({ ok: true }))
    );

    await expect(
      fetch("https://mocked.example.test/value").then((response) => response.json())
    ).resolves.toEqual({ ok: true });
  });

  it("fails an unhandled external request before contacting the network", async () => {
    await expect(fetch("https://unmocked.example.test/leak")).rejects.toThrow(
      'Cannot bypass a request when using the "error" strategy'
    );
  });

  it("allows only an explicitly declared loopback fixture origin", async () => {
    const fixtureServer = await startArticleFixtureServer();
    try {
      await expect(
        fetch(fixtureServer.url("/article")).then((response) => response.status)
      ).resolves.toBe(200);
      expect(() => createLocalPassthroughHandlers(["https://arbitrary.example.test"])).toThrow(
        "Only exact loopback fixture origins may bypass MSW"
      );
    } finally {
      await fixtureServer.close();
    }
  });
});
