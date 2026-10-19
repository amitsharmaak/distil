import { config } from "@/lib/config";

/**
 * YouTube answers the unofficial endpoints by source IP: a laptop is served,
 * a datacenter egress (Vercel) gets `LOGIN_REQUIRED` ("confirm you're not a
 * bot") from every innertube client, and there is no server-side way around
 * it. When `YOUTUBE_PROXY_URL` names a residential proxy, only the YouTube
 * requests travel through it; everything else keeps the platform's egress.
 */
export async function createYouTubeFetch(proxyUrl: string): Promise<typeof fetch> {
  if (!proxyUrl) return fetch;
  // Loaded only when a proxy is configured: undici's fetch needs Node globals
  // that the jsdom component tests (which import the reader page) do not have.
  const { fetch: undiciFetch, ProxyAgent } = await import("undici");
  const dispatcher = new ProxyAgent(proxyUrl);
  const proxied = (input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as never, { ...(init as object), dispatcher } as never);
  return proxied as unknown as typeof fetch;
}

let cached: { proxyUrl: string; fetchImpl: Promise<typeof fetch> } | null = null;

/** The fetch to use for YouTube: proxied when configured, the global fetch otherwise. */
export function youtubeFetch(): Promise<typeof fetch> {
  const proxyUrl = config.youtubeProxyUrl;
  if (!cached || cached.proxyUrl !== proxyUrl) {
    cached = { proxyUrl, fetchImpl: createYouTubeFetch(proxyUrl) };
  }
  return cached.fetchImpl;
}

/** True when YouTube requests go through the configured proxy. */
export function youtubeProxyConfigured(): boolean {
  return config.youtubeProxyUrl.length > 0;
}
