jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({
  getControlPlaneRepositories: jest.fn(),
  getTenantRepositories: jest.fn(),
}));
jest.mock("@/lib/config", () => ({
  config: { databaseControlPlaneUrl: "control-plane-configured" },
}));

import { DELETE } from "@/app/api/v1/admin/invitations/[id]/route";
import { GET, POST } from "@/app/api/v1/admin/invitations/route";
import { AccessDeniedError } from "@/lib/auth/account";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { config } from "@/lib/config";
import { getControlPlaneRepositories, getTenantRepositories } from "@/lib/database";

const origin = "https://distil.example";
const adminId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invitationId = "33333333-3333-4333-8333-333333333333";

const context = (userId: string, actorKind = "user") =>
  ({ userId, actorKind, actorId: userId, requestId }) as never;

const auth = {
  createInvitation: jest.fn(),
  listInvitations: jest.fn(),
  revokeInvitation: jest.fn(),
};
const lifecycle = { audit: jest.fn() };
const rateLimits = { consume: jest.fn() };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/v1/admin/invitations`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function del(id: string, body?: unknown, headers: Record<string, string> = { origin }) {
  return DELETE(
    new Request(`${origin}/api/v1/admin/invitations/${id}`, {
      method: "DELETE",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_API_BASE_URL = origin;
  process.env.DISTIL_ALLOWED_ORIGINS = origin;
  process.env.DISTIL_ADMIN_USER_IDS = adminId;
  (config as { databaseControlPlaneUrl: string }).databaseControlPlaneUrl = "configured";
  jest.mocked(resolveRequestAuthContext).mockResolvedValue(context(adminId));
  jest.mocked(getControlPlaneRepositories).mockResolvedValue({ auth, lifecycle } as never);
  jest.mocked(getTenantRepositories).mockResolvedValue({ rateLimits } as never);
  rateLimits.consume.mockResolvedValue({ allowed: true, remaining: 19, resetAt: "x" });
  auth.createInvitation.mockResolvedValue(undefined);
  auth.revokeInvitation.mockResolvedValue(true);
  auth.listInvitations.mockResolvedValue([]);
  lifecycle.audit.mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.DISTIL_ADMIN_USER_IDS;
});

describe("admin invitation routes: access", () => {
  it.each([
    ["member session", () => context(memberId)],
    ["capture token for the admin account", () => context(adminId, "capture-token")],
  ])("returns 403 for a %s on every method and touches no database", async (_name, make) => {
    jest.mocked(resolveRequestAuthContext).mockResolvedValue(make());
    const responses = [
      await GET(new Request(`${origin}/api/v1/admin/invitations`)),
      await POST(post({ email: "new@example.com" })),
      await del(invitationId),
    ];
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(getControlPlaneRepositories).not.toHaveBeenCalled();
    expect(getTenantRepositories).not.toHaveBeenCalled();
    expect(auth.createInvitation).not.toHaveBeenCalled();
  });

  it("is 403 for everybody when no allowlist is configured", async () => {
    delete process.env.DISTIL_ADMIN_USER_IDS;
    const response = await GET(new Request(`${origin}/api/v1/admin/invitations`));
    expect(response.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    jest
      .mocked(resolveRequestAuthContext)
      .mockRejectedValue(new AccessDeniedError("unauthenticated"));
    const response = await GET(new Request(`${origin}/api/v1/admin/invitations`));
    expect(response.status).toBe(401);
  });

  it("rejects cross-origin mutations before resolving the session", async () => {
    const issue = await POST(
      post({ email: "new@example.com" }, { origin: "https://evil.example" })
    );
    const revoke = await del(invitationId, undefined, { origin: "https://evil.example" });
    expect([issue.status, revoke.status]).toEqual([403, 403]);
    expect(resolveRequestAuthContext).not.toHaveBeenCalled();
    expect(auth.createInvitation).not.toHaveBeenCalled();
  });

  it("answers 503 when the control-plane database is not configured", async () => {
    (config as { databaseControlPlaneUrl: string }).databaseControlPlaneUrl = "";
    const response = await GET(new Request(`${origin}/api/v1/admin/invitations`));
    expect(response.status).toBe(503);
    expect(getControlPlaneRepositories).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/admin/invitations", () => {
  it("issues once, records the session user and audits without the address", async () => {
    const response = await POST(post({ email: "New.Colleague@Example.com", note: "Design team" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.invitationUrl).toMatch(new RegExp(`^${origin}/invite#token=`));
    expect(body.expiresAt).toEqual(expect.any(String));

    expect(auth.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedEmail: "new.colleague@example.com",
        issuedByActorId: adminId,
        issuanceReason: "settings:Design team",
        status: "pending",
      })
    );
    const audit = lifecycle.audit.mock.calls[0][0];
    expect(audit).toMatchObject({
      actorId: adminId,
      action: "invitation.issue",
      targetUserId: body.invitationId,
      outcome: "succeeded",
    });
    expect(JSON.stringify(audit)).not.toContain("colleague");
    expect(JSON.stringify(audit)).not.toContain("token=");
    expect(rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({ key: `admin-invite:${adminId}`, limit: 20, windowSeconds: 86_400 })
    );
  });

  it("uses a default note and still returns the link when the audit write fails", async () => {
    lifecycle.audit.mockRejectedValue(new Error("audit store down"));
    const response = await POST(post({ email: "new@example.com" }));
    expect(response.status).toBe(201);
    expect(auth.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ issuanceReason: "settings:invited from Settings" })
    );
    await expect(response.json()).resolves.toHaveProperty("invitationUrl");
  });

  it("returns 429 after 20 issues in a day and creates nothing", async () => {
    rateLimits.consume.mockResolvedValue({ allowed: false, remaining: 0, resetAt: "x" });
    const response = await POST(post({ email: "new@example.com" }));
    expect(response.status).toBe(429);
    expect(auth.createInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }],
    ["unknown fields", { email: "new@example.com", issuedByActorId: memberId }],
    ["an oversized note", { email: "new@example.com", note: "x".repeat(201) }],
    ["malformed JSON", "{oops"],
  ])("returns 400 for %s", async (_name, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(auth.createInvitation).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/admin/invitations", () => {
  it("lists masked addresses, flags, and no hashes, links or actor ids", async () => {
    auth.listInvitations.mockResolvedValue([
      {
        id: invitationId,
        normalizedEmail: "new.colleague@example.com",
        status: "pending",
        issuedByActorId: adminId,
        issuanceReason: "settings:invited from Settings",
        createdAt: "2026-09-30T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z",
      },
    ]);
    const response = await GET(new Request(`${origin}/api/v1/admin/invitations`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      invitations: [
        {
          id: invitationId,
          maskedEmail: "n***@example.com",
          status: "pending",
          createdAt: "2026-09-30T00:00:00.000Z",
          expiresAt: "2999-01-01T00:00:00.000Z",
          issuedByYou: true,
        },
      ],
    });
    expect(text).not.toContain("colleague");
    expect(text).not.toContain(adminId);
  });
});

describe("DELETE /api/v1/admin/invitations/:id", () => {
  it("revokes with the session user and the given reason, then audits", async () => {
    const response = await del(invitationId, { reason: "wrong address" });
    expect(response.status).toBe(204);
    expect(auth.revokeInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationId,
        revokedByActorId: adminId,
        reason: "settings:wrong address",
      })
    );
    expect(lifecycle.audit.mock.calls[0][0]).toMatchObject({
      action: "invitation.revoke",
      outcome: "succeeded",
    });
  });

  it("accepts an empty body with a default reason", async () => {
    const response = await del(invitationId);
    expect(response.status).toBe(204);
    expect(auth.revokeInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "settings:revoked from Settings" })
    );
  });

  it("returns 404 when the invitation is not pending or does not exist", async () => {
    auth.revokeInvitation.mockResolvedValue(false);
    expect((await del(invitationId)).status).toBe(404);
    expect(lifecycle.audit.mock.calls[0][0]).toMatchObject({ outcome: "no-op" });
  });

  it("returns 404 for a malformed id without touching the database", async () => {
    expect((await del("not-a-uuid")).status).toBe(404);
    expect(getControlPlaneRepositories).not.toHaveBeenCalled();
  });
});
