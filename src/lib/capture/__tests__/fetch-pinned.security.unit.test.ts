import { EventEmitter } from "node:events";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import { fetchArticle } from "../fetch";
import { publicDns } from "./fixtures";

jest.mock("node:http", () => ({ request: jest.fn() }));
jest.mock("node:https", () => ({ request: jest.fn() }));

type Incoming = Readable & {
  statusCode?: number;
  statusMessage?: string;
  headers: Record<string, string | string[] | undefined>;
};

function installRequest(
  request: jest.MockedFunction<typeof httpsRequest>,
  options: {
    body?: string;
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
    requestError?: Error;
  } = {}
) {
  request.mockImplementation(((...args: unknown[]) => {
    const callback = args[1] as ((incoming: never) => void) | undefined;
    const outgoing = new EventEmitter() as EventEmitter & { end: () => void };
    outgoing.end = () => {
      if (options.requestError) {
        outgoing.emit("error", options.requestError);
        return;
      }
      const incoming = Readable.from(options.body ? [Buffer.from(options.body)] : []) as Incoming;
      incoming.statusCode = options.statusCode;
      incoming.statusMessage = "Fixture";
      incoming.headers = options.headers ?? { "content-type": "text/html" };
      callback?.(incoming as never);
    };
    return outgoing as never;
  }) as typeof httpsRequest);
}

describe("DNS-pinned transport", () => {
  const mockedHttps = jest.mocked(httpsRequest);
  const mockedHttp = jest.mocked(httpRequest);

  beforeEach(() => {
    mockedHttps.mockReset();
    mockedHttp.mockReset();
  });

  it("connects to the resolved address while retaining the original host", async () => {
    installRequest(mockedHttps, {
      body: "<article>pinned</article>",
      statusCode: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": ["a=1", "b=2"],
        "x-omitted": undefined,
      },
    });

    await expect(
      fetchArticle("https://example.com:8443/story", { resolve: publicDns })
    ).resolves.toMatchObject({
      body: "<article>pinned</article>",
      contentType: "text/html",
    });
    expect(mockedHttps).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "93.184.216.34",
        family: 4,
        port: "8443",
        servername: "example.com",
        headers: expect.objectContaining({ Host: "example.com:8443" }),
      }),
      expect.any(Function)
    );
  });

  it("uses HTTP transport, the default status, and rejects an empty no-content response", async () => {
    installRequest(mockedHttp as jest.MockedFunction<typeof httpsRequest>, {
      statusCode: undefined,
      headers: { "content-type": "text/plain" },
    });
    await expect(
      fetchArticle("http://example.com/empty", { resolve: publicDns })
    ).rejects.toMatchObject({
      code: "UPSTREAM_500",
    });
    expect(mockedHttp).toHaveBeenCalled();
  });

  it("propagates transport errors through the transient processing envelope", async () => {
    installRequest(mockedHttps, { requestError: new Error("socket failed") });
    await expect(fetchArticle("https://example.com", { resolve: publicDns })).rejects.toMatchObject(
      {
        code: "UPSTREAM_UNAVAILABLE",
        kind: "transient",
      }
    );
  });

  it("rejects malformed incoming headers and destroys the response stream", async () => {
    const destroy = jest.fn();
    mockedHttps.mockImplementation(((...args: unknown[]) => {
      const callback = args[1] as ((incoming: never) => void) | undefined;
      const outgoing = new EventEmitter() as EventEmitter & { end: () => void };
      outgoing.end = () => {
        const incoming = Readable.from([Buffer.from("body")]) as Incoming;
        incoming.statusCode = 200;
        incoming.headers = { "bad header": "value" };
        incoming.destroy = destroy;
        callback?.(incoming as never);
      };
      return outgoing as never;
    }) as typeof httpsRequest);

    await expect(fetchArticle("https://example.com", { resolve: publicDns })).rejects.toMatchObject(
      {
        code: "UPSTREAM_UNAVAILABLE",
      }
    );
    expect(destroy).toHaveBeenCalled();
  });
});
