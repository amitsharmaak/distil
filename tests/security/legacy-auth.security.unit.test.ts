import { NextRequest } from "next/server";

type AuthModule = typeof import("@/lib/middleware/auth");

const originalApiToken = process.env.DISTIL_API_TOKEN;

function loadAuth(apiToken?: string): AuthModule {
  jest.resetModules();

  if (apiToken === undefined) {
    delete process.env.DISTIL_API_TOKEN;
  } else {
    process.env.DISTIL_API_TOKEN = apiToken;
  }

  return jest.requireActual<AuthModule>("@/lib/middleware/auth");
}

afterEach(() => {
  jest.resetModules();

  if (originalApiToken === undefined) {
    delete process.env.DISTIL_API_TOKEN;
  } else {
    process.env.DISTIL_API_TOKEN = originalApiToken;
  }
});

describe("legacy API token authentication", () => {
  it("allows requests when legacy token authentication is disabled", () => {
    const { checkAuth, isAuthEnabled } = loadAuth();
    const request = new NextRequest("http://localhost:3000/api/items");

    expect(isAuthEnabled()).toBe(false);
    expect(checkAuth(request)).toBeNull();
  });

  it("rejects a missing Authorization header when authentication is enabled", async () => {
    const { checkAuth } = loadAuth("configured-secret");
    const request = new NextRequest("http://localhost:3000/api/items");

    const response = checkAuth(request);

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: "Missing Authorization header",
    });
  });

  it("rejects an invalid bearer token without exposing the configured secret", async () => {
    const configuredSecret = "configured-secret";
    const { checkAuth } = loadAuth(configuredSecret);
    const request = new NextRequest("http://localhost:3000/api/items", {
      headers: { Authorization: "Bearer wrong-secret" },
    });

    const response = checkAuth(request);
    const body = await response?.text();

    expect(response?.status).toBe(401);
    expect(body).toContain("Invalid API token");
    expect(body).not.toContain(configuredSecret);
  });

  it("accepts the configured bearer token", () => {
    const configuredSecret = "configured-secret";
    const { checkAuth } = loadAuth(configuredSecret);
    const request = new NextRequest("http://localhost:3000/api/items", {
      headers: { Authorization: `Bearer ${configuredSecret}` },
    });

    expect(checkAuth(request)).toBeNull();
  });
});
