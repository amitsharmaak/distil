import { HttpResponse, http } from "msw";
import { startArticleFixtureServer } from "../support/fixture-server";
import { closeStrictMswServer, createStrictMswServer } from "../support/msw";

describe("strict MSW server", () => {
  it("serves declared mocks", async () => {
    const server = createStrictMswServer({
      handlers: [
        http.get("https://mocked.example.test/value", () => HttpResponse.json({ ok: true })),
      ],
    });

    try {
      await expect(
        fetch("https://mocked.example.test/value").then((response) => response.json())
      ).resolves.toEqual({ ok: true });
    } finally {
      closeStrictMswServer(server);
    }
  });

  it("fails an unhandled external request before contacting the network", async () => {
    const server = createStrictMswServer();

    try {
      await expect(fetch("https://unmocked.example.test/leak")).rejects.toThrow(
        'Cannot bypass a request when using the "error" strategy'
      );
    } finally {
      closeStrictMswServer(server);
    }
  });

  it("allows only an explicitly declared loopback fixture origin", async () => {
    const fixtureServer = await startArticleFixtureServer();
    const server = createStrictMswServer({
      allowedLocalOrigins: [fixtureServer.origin],
    });

    try {
      await expect(
        fetch(fixtureServer.url("/article")).then((response) => response.status)
      ).resolves.toBe(200);
      expect(() =>
        createStrictMswServer({
          allowedLocalOrigins: ["https://arbitrary.example.test"],
        })
      ).toThrow("Only exact loopback fixture origins may bypass MSW");
    } finally {
      closeStrictMswServer(server);
      await fixtureServer.close();
    }
  });
});
