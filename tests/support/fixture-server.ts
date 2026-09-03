import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  CANONICAL_ARTICLE_HTML,
  MALFORMED_ARTICLE_HTML,
  MISSING_METADATA_ARTICLE_HTML,
  NON_CONTENT_BODY,
  NORMAL_ARTICLE_HTML,
  createOversizedArticleHtml,
} from "../fixtures/articles";

export const FIXTURE_PUBLIC_HOSTNAME = "public.distil.test";
export const FIXTURE_PRIVATE_HOSTNAME = "private.distil.test";
export const FIXTURE_PUBLIC_ADDRESS = "93.184.216.34";
export const FIXTURE_PRIVATE_ADDRESS = "127.0.0.1";

export interface FixtureDnsLookupResult {
  address: string;
  family: 4;
}

export type FixtureDnsLookup = (hostname: string) => Promise<FixtureDnsLookupResult>;

export interface ArticleFixtureServerOptions {
  slowResponseMs?: number;
  oversizedResponseBytes?: number;
}

export interface ArticleFixtureServer {
  origin: string;
  publicOrigin: string;
  privateOrigin: string;
  url(path: string): string;
  publicUrl(path: string): string;
  privateUrl(path: string): string;
  lookup: FixtureDnsLookup;
  close(): Promise<void>;
}

function send(
  response: ServerResponse,
  status: number,
  body: string,
  contentType = "text/html; charset=utf-8"
): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { location, "cache-control": "no-store" });
  response.end();
}

function closeServer(server: Server, timers: Set<NodeJS.Timeout>): Promise<void> {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

/** Start a loopback-only server containing every capture edge-case fixture. */
export async function startArticleFixtureServer(
  options: ArticleFixtureServerOptions = {}
): Promise<ArticleFixtureServer> {
  const slowResponseMs = options.slowResponseMs ?? 250;
  const oversizedResponseBytes = options.oversizedResponseBytes;
  const timers = new Set<NodeJS.Timeout>();
  let port = 0;

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://fixture.invalid");

    switch (requestUrl.pathname) {
      case "/article":
      case "/article/canonical-source":
        send(response, 200, NORMAL_ARTICLE_HTML);
        return;
      case "/article/canonical":
        send(response, 200, CANONICAL_ARTICLE_HTML);
        return;
      case "/article/missing-metadata":
        send(response, 200, MISSING_METADATA_ARTICLE_HTML);
        return;
      case "/article/malformed":
        send(response, 200, MALFORMED_ARTICLE_HTML);
        return;
      case "/article/oversized":
        send(response, 200, createOversizedArticleHtml(oversizedResponseBytes));
        return;
      case "/non-content":
        send(response, 200, NON_CONTENT_BODY, "application/pdf");
        return;
      case "/redirect":
        redirect(response, "/article");
        return;
      case "/redirect-loop/a":
        redirect(response, "/redirect-loop/b");
        return;
      case "/redirect-loop/b":
        redirect(response, "/redirect-loop/a");
        return;
      case "/redirect/public-to-private":
        redirect(response, `http://${FIXTURE_PRIVATE_HOSTNAME}:${port}/article`);
        return;
      case "/slow": {
        const delayParameter = requestUrl.searchParams.get("delayMs");
        const requestedDelay = delayParameter === null ? Number.NaN : Number(delayParameter);
        const delayMs = Number.isFinite(requestedDelay)
          ? Math.max(0, requestedDelay)
          : slowResponseMs;
        const timer = setTimeout(() => {
          timers.delete(timer);
          send(response, 200, NORMAL_ARTICLE_HTML);
        }, delayMs);
        timers.add(timer);
        return;
      }
      case "/connection-close":
        request.socket.destroy();
        return;
      case "/status/400":
      case "/status/404":
      case "/status/429":
      case "/status/500": {
        const status = Number(requestUrl.pathname.slice("/status/".length));
        if (status === 429) {
          response.setHeader("retry-after", "1");
        }
        send(
          response,
          status,
          JSON.stringify({ status, error: `fixture-${status}` }),
          "application/json; charset=utf-8"
        );
        return;
      }
      default:
        send(
          response,
          404,
          JSON.stringify({ status: 404, error: "fixture-not-found" }),
          "application/json; charset=utf-8"
        );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  const publicOrigin = `http://${FIXTURE_PUBLIC_HOSTNAME}:${port}`;
  const privateOrigin = `http://${FIXTURE_PRIVATE_HOSTNAME}:${port}`;

  const lookup: FixtureDnsLookup = async (hostname) => {
    if (hostname === FIXTURE_PUBLIC_HOSTNAME) {
      return { address: FIXTURE_PUBLIC_ADDRESS, family: 4 };
    }
    if (hostname === FIXTURE_PRIVATE_HOSTNAME) {
      return { address: FIXTURE_PRIVATE_ADDRESS, family: 4 };
    }
    throw Object.assign(new Error(`Fixture DNS has no record for ${hostname}`), {
      code: "ENOTFOUND",
    });
  };

  return {
    origin,
    publicOrigin,
    privateOrigin,
    url: (path) => new URL(path, origin).toString(),
    publicUrl: (path) => new URL(path, publicOrigin).toString(),
    privateUrl: (path) => new URL(path, privateOrigin).toString(),
    lookup,
    close: () => closeServer(server, timers),
  };
}
