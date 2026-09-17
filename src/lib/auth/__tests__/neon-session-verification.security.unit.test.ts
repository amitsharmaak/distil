import { NextRequest } from "next/server";
import {
  getNeonProxyProvider,
  verifyNeonSession,
  type NeonSessionHandlerSource,
} from "@/lib/auth/neon-server";

// The SDK is ESM-only; the verification under test never reaches it.
jest.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: jest.fn() }));

const sessionCookie = "__Secure-neon-auth.session_token=opaque-session-token";
const refreshedCookie = "__Secure-neon-auth.local.session_data=refreshed; Path=/; HttpOnly";
const providerSession = {
  user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
  session: { id: "40000000-0000-4000-8000-000000000004", createdAt: "2026-09-17T12:00:00.000Z" },
};

function handlerSource(respond: () => Response) {
  const GET = jest.fn(async () => respond());
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

  it("asks the SDK's get-session handler once, past its cookie cache, with the inbound cookies", async () => {
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
