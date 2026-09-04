import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import { CaptureProcessingError, processingError } from "./errors";
import { resolveSafeUrl, type DnsAddress, type DnsResolver } from "./url-safety";

export interface SafeFetchOptions {
  fetch?: typeof globalThis.fetch;
  resolve?: DnsResolver;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

export interface FetchedArticle {
  url: string;
  body: string;
  contentType: string;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function pinnedFetch(
  url: URL,
  addresses: readonly DnsAddress[],
  init: RequestInit
): Promise<Response> {
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        headers: { ...Object.fromEntries(new Headers(init.headers).entries()), Host: url.host },
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
          else if (value !== undefined) headers.set(name, value);
        }
        resolve(
          new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
            status: incoming.statusCode ?? 500,
            statusText: incoming.statusMessage,
            headers,
          })
        );
      }
    );
    request.once("error", reject);
    request.end();
  });
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new CaptureProcessingError(
        "CONTENT_TOO_LARGE",
        "The source is too large to process",
        "rejected"
      );
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

export async function fetchArticle(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<FetchedArticle> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const resolve = options.resolve;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  let current = rawUrl;
  const seen = new Set<string>();

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const safe = await resolveSafeUrl(current, resolve);
    const safeUrl = safe.url;
    const key = safeUrl.toString();
    if (seen.has(key)) {
      throw new CaptureProcessingError(
        "REDIRECT_LOOP",
        "The source contains a redirect loop",
        "terminal"
      );
    }
    seen.add(key);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let response: Response;
    try {
      const init: RequestInit = {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8" },
      };
      response = options.fetch
        ? await fetchImpl(safeUrl, init)
        : await pinnedFetch(safeUrl, safe.addresses, init);
    } catch (error) {
      throw processingError(error);
    } finally {
      clearTimeout(timeout);
    }

    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new CaptureProcessingError(
          "INVALID_REDIRECT",
          "The source returned an invalid redirect",
          "terminal"
        );
      }
      if (redirect === maxRedirects) {
        throw new CaptureProcessingError(
          "TOO_MANY_REDIRECTS",
          "The source redirected too many times",
          "terminal"
        );
      }
      current = new URL(location, safeUrl).toString();
      continue;
    }

    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new CaptureProcessingError(
        `UPSTREAM_${response.status}`,
        `The source returned HTTP ${response.status}`,
        "transient"
      );
    }
    if (response.status >= 400) {
      throw new CaptureProcessingError(
        `UPSTREAM_${response.status}`,
        `The source returned HTTP ${response.status}`,
        "terminal"
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) {
      throw new CaptureProcessingError(
        "CONTENT_TOO_LARGE",
        "The source is too large to process",
        "rejected"
      );
    }
    const bodyTimeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let body: string;
    try {
      body = await readBounded(response, maxBytes);
    } catch (error) {
      if (error instanceof CaptureProcessingError) throw error;
      throw processingError(error);
    } finally {
      clearTimeout(bodyTimeout);
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim() ?? "";
    if (
      !contentType.startsWith("text/html") &&
      !contentType.startsWith("application/xhtml+xml") &&
      !contentType.startsWith("text/plain")
    ) {
      throw new CaptureProcessingError(
        "UNSUPPORTED_CONTENT",
        "The source is not a supported article",
        "rejected"
      );
    }
    if (!body.trim()) {
      throw new CaptureProcessingError(
        "EMPTY_CONTENT",
        "The source did not contain readable content",
        "rejected"
      );
    }
    return { url: safeUrl.toString(), body, contentType };
  }

  throw new CaptureProcessingError(
    "TOO_MANY_REDIRECTS",
    "The source redirected too many times",
    "terminal"
  );
}
