import { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { createSessionToken } from "@/lib/auth/session";

type AuthModule = typeof import("@/lib/middleware/auth");

const originalEnvironment = {
  apiToken: process.env.DISTIL_API_TOKEN,
  passwordHash: process.env.DISTIL_WEB_PASSWORD_HASH,
  sessionSecret: process.env.DISTIL_SESSION_SECRET,
  nodeEnv: process.env.NODE_ENV,
};

function setOrDelete(name: string, value?: string): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function loadAuth(
  options: {
    apiToken?: string;
    configured?: boolean;
    nodeEnv?: string;
  } = {}
): AuthModule {
  jest.resetModules();
  setOrDelete("DISTIL_API_TOKEN", options.apiToken);
  setOrDelete(
    "DISTIL_WEB_PASSWORD_HASH",
    options.configured ? "scrypt$16384$8$1$salt$hash" : undefined
  );
  setOrDelete(
    "DISTIL_SESSION_SECRET",
    options.configured ? "a-session-secret-with-at-least-32-bytes" : undefined
  );
  setOrDelete("NODE_ENV", options.nodeEnv ?? "test");
  return jest.requireActual<AuthModule>("@/lib/middleware/auth");
}

afterEach(() => {
  jest.resetModules();
  setOrDelete("DISTIL_API_TOKEN", originalEnvironment.apiToken);
  setOrDelete("DISTIL_WEB_PASSWORD_HASH", originalEnvironment.passwordHash);
  setOrDelete("DISTIL_SESSION_SECRET", originalEnvironment.sessionSecret);
  setOrDelete("NODE_ENV", originalEnvironment.nodeEnv);
});

describe("single-user middleware authentication", () => {
  it("allows local development when authentication is not configured", async () => {
    const { checkAuth, isAuthEnabled } = loadAuth();
    const request = new NextRequest("http://localhost:3000/api/items");

    expect(isAuthEnabled()).toBe(false);
    await expect(checkAuth(request)).resolves.toBeNull();
  });

  it("fails closed in production when authentication is not configured", async () => {
    const { checkAuth } = loadAuth({ nodeEnv: "production" });
    const response = await checkAuth(new NextRequest("https://distil.test/api/items"));

    expect(response?.status).toBe(503);
  });

  it("accepts the deprecated token only on legacy capture", async () => {
    const { checkAuth } = loadAuth({ apiToken: "configured-secret", configured: true });

    await expect(
      checkAuth(
        new NextRequest("https://distil.test/api/items", {
          method: "POST",
          headers: { authorization: "Bearer configured-secret" },
        })
      )
    ).resolves.toBeNull();

    const other = await checkAuth(
      new NextRequest("https://distil.test/api/notifications", {
        headers: { authorization: "Bearer configured-secret" },
      })
    );
    expect(other?.status).toBe(401);
  });

  it.each(["GET", "HEAD", "OPTIONS"])(
    "rejects legacy capture credentials for %s /api/items",
    async (method) => {
      const { checkAuth } = loadAuth({ apiToken: "configured-secret", configured: true });
      const response = await checkAuth(
        new NextRequest("https://distil.test/api/items", {
          method,
          headers: { authorization: "Bearer configured-secret" },
        })
      );
      expect(response?.status).toBe(401);
    }
  );

  it("requires an allowed origin for session-authenticated mutations", async () => {
    const secret = "a-session-secret-with-at-least-32-bytes";
    const token = await createSessionToken(secret);
    const { checkAuth } = loadAuth({ configured: true });
    const response = await checkAuth(
      new NextRequest("https://distil.test/api/notifications", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, origin: "https://hostile.test" },
      })
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" },
    });
  });

  it("does not expose the configured legacy secret", async () => {
    const configuredSecret = "configured-secret";
    const { checkAuth } = loadAuth({ apiToken: configuredSecret, configured: true });
    const response = await checkAuth(
      new NextRequest("https://distil.test/api/items", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    );

    expect(response?.status).toBe(401);
    await expect(response?.text()).resolves.not.toContain(configuredSecret);
  });

  it("accepts a valid signed session for private APIs", async () => {
    const secret = "a-session-secret-with-at-least-32-bytes";
    const token = await createSessionToken(secret);
    const { checkAuth } = loadAuth({ configured: true });

    await expect(
      checkAuth(
        new NextRequest("https://distil.test/api/notifications", {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
        })
      )
    ).resolves.toBeNull();
  });

  it("redirects unauthenticated page requests to login", async () => {
    const { checkAuth } = loadAuth({ configured: true });
    const response = await checkAuth(new NextRequest("https://distil.test/feed?filter=unread"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://distil.test/login?next=%2Ffeed%3Ffilter%3Dunread"
    );
  });

  it.each([
    "/login",
    "/api/auth/login",
    "/api/auth/session",
    "/api/health",
    "/api/queue/capture-requests",
    "/api/v1/captures",
    "/api/v1/capture-tokens",
  ])("passes %s to its specialized authentication", async (pathname) => {
    const { checkAuth } = loadAuth({ configured: true });
    await expect(checkAuth(new NextRequest(`https://distil.test${pathname}`))).resolves.toBeNull();
  });
});
