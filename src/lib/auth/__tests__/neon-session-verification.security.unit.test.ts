import { NextRequest } from "next/server";
import {
  getNeonProxyProvider,
  shouldUseNeonSessionCookieCache,
  verifyNeonSession,
  type NeonSessionHandlerSource,
} from "@/lib/auth/neon-server";
import { encodeJsonBase64Url } from "@/lib/auth/hmac";

// The SDK is ESM-only; the verification under test never reaches it.
jest.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: jest.fn() }));

const sessionCookie = "__Secure-neon-auth.session_token=opaque-session-token";
const sessionDataCookieName = "__Secure-neon-auth.local.session_data";
const refreshedCookie = "__Secure-neon-auth.local.session_data=refreshed; Path=/; HttpOnly";
const providerSession = {
  user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
  session: { id: "40000000-0000-4000-8000-000000000004", createdAt: "2026-09-17T12:00:00.000Z" },
};

function sessionDataToken(expiresAt: Date) {
  return [
    encodeJsonBase64Url({ alg: "HS256", typ: "JWT" }),
    encodeJsonBase64Url({ ...providerSession, exp: Math.floor(expiresAt.getTime() / 1000) }),
    "signed-fixture",
  ].join(".");
}

function cachedCookies(expiresAt: Date) {
  return `${sessionCookie}; ${sessionDataCookieName}=${sessionDataToken(expiresAt)}`;
}

function handlerSource(respond: (request: Request) => Response) {
  const GET = jest.fn(async (request: Request) => respond(request));
  const source: NeonSessionHandlerSource = { handler: () => ({ GET }) };
  return { source, GET };
}

function okResponse(body: unknown, setCookie?: string) {
  const response = Response.json(body);
  if (setCookie) response.headers.append("set-cookie", setCookie);
  return response;
}

describe("Neon session verification through the SDK route handler", () => {
  it("skips the provider entirely when no session-token cookie is present", async () => {
    const { source, GET } = handlerSource(() => okResponse(providerSession));
    const result = await verifyNeonSession(
      source,
      new NextRequest("https://distil.example/api/v1/feed", {
        headers: { cookie: "__Secure-neon-auth.local.session_data=stale-cache-only" },
      })
    );
    expect(GET).not.toHaveBeenCalled();
    expect(result.session).toEqual({ data: null, error: null });
    expect([...result.headers.keys()]).toEqual([]);
  });

  it("uses the SDK's signed cache for ordinary GET and RSC reads without an upstream call", async () => {
    const now = new Date();
    const cookies = cachedCookies(new Date(now.getTime() + 30_000));
    const upstream = jest.fn(() => okResponse(providerSession, refreshedCookie));
    const { source, GET } = handlerSource((request) => {
      if (new URL(request.url).searchParams.get("disableCookieCache") === "true") {
        return upstream();
      }
      return okResponse(providerSession);
    });

    for (const url of ["https://distil.example/feed", "https://distil.example/feed?_rsc=owned"]) {
      const result = await verifyNeonSession(
        source,
        new NextRequest(url, { headers: { cookie: cookies, rsc: "1" } })
      );
      expect(result.session.data?.user.id).toBe("provider-subject");
    }

    expect(GET).toHaveBeenCalledTimes(2);
    for (const [verification] of GET.mock.calls) {
      expect(new URL(verification.url).searchParams.has("disableCookieCache")).toBe(false);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("asks the SDK's get-session handler once, past its cookie cache, for an API mutation", async () => {
    const { source, GET } = handlerSource(() => okResponse(providerSession, refreshedCookie));
    const inbound = new NextRequest("https://distil.example/api/v1/feed?cursor=owned", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
        "content-length": "2",
        "user-agent": "distil-test",
      },
      body: "{}",
    });

    const result = await verifyNeonSession(source, inbound);

    expect(GET).toHaveBeenCalledTimes(1);
    const [verification, context] = GET.mock.calls[0] as unknown as [
      Request,
      { params: Promise<{ path: string[] }> },
    ];
    expect(verification.method).toBe("GET");
    expect(verification.url).toBe(
      "https://distil.example/api/auth/get-session?disableCookieCache=true"
    );
    expect(verification.headers.get("cookie")).toBe(sessionCookie);
    expect(verification.headers.get("user-agent")).toBe("distil-test");
    expect(verification.headers.get("content-type")).toBeNull();
    expect(verification.headers.get("content-length")).toBeNull();
    await expect(context.params).resolves.toEqual({ path: ["get-session"] });
    // The application request is untouched.
    expect(inbound.nextUrl.searchParams.get("disableCookieCache")).toBeNull();

    expect(result.session).toEqual({ data: providerSession, error: null });
    expect(result.headers.get("set-cookie")).toBe(refreshedCookie);
  });

  it.each([
    ["POST", "/feed"],
    ["GET", "/api/v1/feed"],
    ["GET", "/api/auth/get-session"],
    ["GET", "/account"],
    ["GET", "/api/v1/captures"],
    ["GET", "/api/v1/capture-tokens"],
    ["HEAD", "/api/v1/account/deletion"],
  ])("keeps %s %s uncached even with fresh session data", async (method, path) => {
    const { source, GET } = handlerSource(() => okResponse(providerSession));
    await verifyNeonSession(
      source,
      new NextRequest(`https://distil.example${path}`, {
        method,
        headers: { cookie: cachedCookies(new Date(Date.now() + 30_000)) },
      })
    );

    expect(GET).toHaveBeenCalledTimes(1);
    const [verification] = GET.mock.calls[0];
    expect(new URL(verification.url).searchParams.get("disableCookieCache")).toBe("true");
  });

  it.each([
    ["missing", sessionCookie],
    ["expired", cachedCookies(new Date(Date.now() - 1_000))],
    ["malformed", `${sessionCookie}; ${sessionDataCookieName}=not-a-jwt`],
  ])("falls back to exactly one uncached provider call for a %s cache", async (_case, cookies) => {
    const providerCall = jest.fn(() => okResponse(providerSession, refreshedCookie));
    const { source, GET } = handlerSource(providerCall);

    const result = await verifyNeonSession(
      source,
      new NextRequest("https://distil.example/feed", { headers: { cookie: cookies } })
    );

    expect(GET).toHaveBeenCalledTimes(1);
    expect(providerCall).toHaveBeenCalledTimes(1);
    expect(new URL(GET.mock.calls[0][0].url).searchParams.get("disableCookieCache")).toBe("true");
    expect(result.headers.get("set-cookie")).toBe(refreshedCookie);
  });

  it("classifies only unexpired ordinary GET/HEAD page requests as cache eligible", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const fresh = cachedCookies(new Date(now.getTime() + 30_000));
    const expired = cachedCookies(now);

    for (const [method, path] of [
      ["GET", "/feed"],
      ["HEAD", "/feed/owned"],
      ["GET", "/feed?_rsc=owned"],
    ] as const) {
      expect(
        shouldUseNeonSessionCookieCache(
          new NextRequest(`https://distil.example${path}`, {
            method,
            headers: { cookie: fresh },
          }),
          now
        )
      ).toBe(true);
    }

    expect(
      shouldUseNeonSessionCookieCache(
        new NextRequest("https://distil.example/feed", { headers: { cookie: expired } }),
        now
      )
    ).toBe(false);
    expect(
      shouldUseNeonSessionCookieCache(
        new NextRequest("https://distil.example/feed", { headers: { cookie: sessionCookie } }),
        now
      )
    ).toBe(false);
  });

  it("treats a failed or empty provider answer as unauthenticated, keeping cookie updates", async () => {
    const failed = handlerSource(
      () =>
        new Response("upstream unavailable", {
          status: 502,
          headers: { "set-cookie": refreshedCookie },
        })
    );
    const failure = await verifyNeonSession(
      failed.source,
      new NextRequest("https://distil.example/feed", { headers: { cookie: sessionCookie } })
    );
    expect(failure.session).toEqual({ data: null, error: { status: 502 } });
    expect(failure.headers.get("set-cookie")).toBe(refreshedCookie);

    for (const body of [null, {}, { user: providerSession.user }, "session"] as const) {
      const empty = handlerSource(() => okResponse(body));
      const result = await verifyNeonSession(
        empty.source,
        new NextRequest("https://distil.example/feed", { headers: { cookie: sessionCookie } })
      );
      expect(result.session).toEqual({ data: null, error: null });
    }

    const malformed = handlerSource(() => new Response("not json", { status: 200 }));
    const result = await verifyNeonSession(
      malformed.source,
      new NextRequest("https://distil.example/feed", { headers: { cookie: sessionCookie } })
    );
    expect(result.session).toEqual({ data: null, error: null });
  });

  it("exposes only verifySession to the proxy", async () => {
    const { source, GET } = handlerSource(() => okResponse(providerSession));
    const provider = getNeonProxyProvider(source);
    expect(Object.keys(provider)).toEqual(["verifySession"]);
    const result = await provider.verifySession(
      new NextRequest("https://distil.example/feed", { headers: { cookie: sessionCookie } })
    );
    expect(GET).toHaveBeenCalledTimes(1);
    expect(result.session.data?.user.id).toBe("provider-subject");
  });
});
