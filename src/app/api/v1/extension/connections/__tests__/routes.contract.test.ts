jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({ getTenantRepositories: jest.fn() }));

import { getTenantRepositories } from "@/lib/database";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AccessDeniedError } from "@/lib/auth/account";
import { hashCaptureToken } from "@/lib/auth/capture-tokens";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import type {
  CaptureTokenRepository,
  RateLimitRepository,
  RepositorySet,
} from "@/lib/repositories/ports";
import { GET, POST } from "@/app/api/v1/extension/connections/route";
import { DELETE } from "@/app/api/v1/extension/connections/[id]/route";

const origin = "https://distil.example";
const authContext = createAuthContext({
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
});

let captureTokens: jest.Mocked<CaptureTokenRepository>;
let rateLimits: jest.Mocked<RateLimitRepository>;

const request = (path: string, init: RequestInit = {}) => new Request(`${origin}${path}`, init);
const signedIn = { cookie: "session=ok" };
const json = { "content-type": "application/json" };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DISTIL_ALLOWED_ORIGINS = origin;
  captureTokens = {
    create: jest.fn().mockResolvedValue(undefined),
    replaceActive: jest.fn().mockResolvedValue(undefined),
    findActiveByHash: jest.fn(),
    list: jest.fn().mockResolvedValue([
      {
        userId: authContext.userId,
        id: "conn-1",
        name: "Browser connection",
        tokenPrefix: "dst_cap_abcdefgh",
        kind: "browser",
        label: "Chrome on macOS",
        createdAt: "2026-09-30T00:00:00Z",
      },
      {
        userId: authContext.userId,
        id: "conn-old",
        name: "Browser connection",
        tokenPrefix: "dst_cap_zzzzzzzz",
        kind: "browser",
        label: "Chrome on Linux",
        createdAt: "2026-09-01T00:00:00Z",
        revokedAt: "2026-09-02T00:00:00Z",
      },
    ]),
    revoke: jest.fn().mockResolvedValue(true),
    touchLastUsed: jest.fn(),
  };
  rateLimits = {
    consume: jest
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 19, resetAt: "2026-09-30T01:00:00Z" }),
  };
  jest
    .mocked(getTenantRepositories)
    .mockResolvedValue({ captureTokens, rateLimits } as unknown as RepositorySet);
  jest.mocked(resolveRequestAuthContext).mockImplementation(async (incoming) => {
    if (!incoming.headers.get("cookie")) throw new AccessDeniedError("unauthenticated");
    return authContext;
  });
});

afterAll(() => {
  delete process.env.DISTIL_ALLOWED_ORIGINS;
});

describe("GET /api/v1/extension/connections", () => {
  it("requires a session", async () => {
    const response = await GET(request("/api/v1/extension/connections"));
    expect(response.status).toBe(401);
    expect(getTenantRepositories).not.toHaveBeenCalled();
  });

  it("lists only the caller's active browser connections, never hashes or prefixes", async () => {
    const response = await GET(request("/api/v1/extension/connections", { headers: signedIn }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(captureTokens.list).toHaveBeenCalledWith("browser");
    const body = await response.json();
    expect(body.connections).toEqual([
      { id: "conn-1", label: "Chrome on macOS", createdAt: "2026-09-30T00:00:00Z" },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|tokenPrefix|dst_cap_/);
  });
});

describe("POST /api/v1/extension/connections", () => {
  it("requires an allowed origin before anything else", async () => {
    const hostile = await POST(
      request("/api/v1/extension/connections", {
        method: "POST",
        headers: { ...signedIn, ...json, origin: "https://hostile.example" },
        body: JSON.stringify({ label: "Chrome" }),
      })
    );
    expect(hostile.status).toBe(403);
    const missing = await POST(
      request("/api/v1/extension/connections", { method: "POST", headers: signedIn })
    );
    expect(missing.status).toBe(403);
    expect(captureTokens.create).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    const response = await POST(
      request("/api/v1/extension/connections", { method: "POST", headers: { origin } })
    );
    expect(response.status).toBe(401);
    expect(captureTokens.create).not.toHaveBeenCalled();
  });

  it("mints one browser token, returns the plaintext once, stores only its hash and revokes nothing", async () => {
    const response = await POST(
      request("/api/v1/extension/connections", {
        method: "POST",
        headers: { ...signedIn, ...json, origin },
        body: JSON.stringify({ label: "Chrome on macOS", userId: "someone-else", kind: "manual" }),
      })
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.token).toMatch(/^dst_cap_[A-Za-z0-9_-]{43}$/);
    expect(body.connection).toMatchObject({
      label: "Chrome on macOS",
      accountId: authContext.userId,
    });
    expect(captureTokens.replaceActive).not.toHaveBeenCalled();
    expect(captureTokens.revoke).not.toHaveBeenCalled();
    const stored = captureTokens.create.mock.calls[0][0];
    expect(stored).toMatchObject({
      userId: authContext.userId,
      kind: "browser",
      label: "Chrome on macOS",
      tokenHash: hashCaptureToken(body.token),
    });
    expect(JSON.stringify(stored)).not.toContain(body.token);
  });

  it("defaults a missing label and rejects a non-string one", async () => {
    const missing = await POST(
      request("/api/v1/extension/connections", {
        method: "POST",
        headers: { ...signedIn, origin },
      })
    );
    expect(missing.status).toBe(201);
    expect(captureTokens.create.mock.calls[0][0]).toMatchObject({ label: "Browser" });

    const invalid = await POST(
      request("/api/v1/extension/connections", {
        method: "POST",
        headers: { ...signedIn, ...json, origin },
        body: JSON.stringify({ label: { nested: true } }),
      })
    );
    expect(invalid.status).toBe(400);
    expect(captureTokens.create).toHaveBeenCalledTimes(1);
  });

  it("rate limits minting per account", async () => {
    rateLimits.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: "2026-09-30T01:00:00Z",
    });
    const response = await POST(
      request("/api/v1/extension/connections", {
        method: "POST",
        headers: { ...signedIn, ...json, origin },
        body: JSON.stringify({ label: "Chrome" }),
      })
    );
    expect(response.status).toBe(429);
    expect(rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({ key: `extension-connect:${authContext.userId}` })
    );
    expect(captureTokens.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/extension/connections/:id", () => {
  const call = (id: string, headers: Record<string, string>) =>
    DELETE(request(`/api/v1/extension/connections/${id}`, { method: "DELETE", headers }), {
      params: Promise.resolve({ id }),
    });

  it("requires an allowed origin and a session", async () => {
    expect((await call("conn-1", { ...signedIn, origin: "https://hostile.example" })).status).toBe(
      403
    );
    expect((await call("conn-1", { origin })).status).toBe(401);
    expect(captureTokens.revoke).not.toHaveBeenCalled();
  });

  it("revokes one browser connection, restricted to the browser kind", async () => {
    const response = await call("conn-1", { ...signedIn, origin });
    expect(response.status).toBe(204);
    expect(captureTokens.revoke).toHaveBeenCalledWith("conn-1", expect.any(String), "browser");
  });

  it("answers 404 for a foreign, revoked or manual-token id without disclosing which", async () => {
    captureTokens.revoke.mockResolvedValue(false);
    const response = await call("someone-elses", { ...signedIn, origin });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CAPTURE_NOT_FOUND" },
    });
  });
});
