import {
  createPasswordChangeHandler,
  createPasswordResetHandler,
  createPasswordResetRequestHandler,
  createPasswordSignInHandler,
  neonPasswordProvider,
  PASSWORD_MIN_LENGTH,
  type PasswordProvider,
} from "@/lib/auth/password-login";
import { AuthError } from "@/lib/auth/errors";
import type { AuthRepositoryPort } from "@/lib/auth/ports";

const origin = "https://distil.example";
const userId = "20000000-0000-4000-8000-000000000002";

function repository(): jest.Mocked<AuthRepositoryPort> {
  return {
    createInvitation: jest.fn(),
    findInvitationById: jest.fn(),
    revokeInvitation: jest.fn(),
    claimInvitationDispatch: jest.fn(),
    completeInvitationDispatch: jest.fn(),
    failInvitationDispatch: jest.fn(),
    consumeInvitationAndLinkIdentity: jest.fn(),
    findAccountByEmail: jest.fn(),
    findAccountByIdentity: jest.fn(),
  };
}

function activeAccount() {
  return { userId, primaryEmail: "amit@example.com", status: "active" as const } as never;
}

function fakeProvider(): jest.Mocked<PasswordProvider> {
  return {
    getSession: jest.fn(),
    signInWithPassword: jest.fn().mockResolvedValue({ ok: true, setCookieHeaders: [] }),
    requestPasswordReset: jest.fn().mockResolvedValue({ ok: true }),
    resetPassword: jest.fn().mockResolvedValue({ ok: true }),
    changePassword: jest.fn().mockResolvedValue({ ok: true, setCookieHeaders: [] }),
  };
}

function request(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("password sign-in", () => {
  it("rejects a disallowed origin", async () => {
    const repositories = repository();
    const provider = fakeProvider();
    const handler = createPasswordSignInHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      new Request(`${origin}/api/auth/sign-in/password`, {
        method: "POST",
        headers: { origin: "https://hostile.example", "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com", password: "correct-horse-battery" }),
      })
    );
    expect(response.status).toBe(403);
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects malformed input", async () => {
    const repositories = repository();
    const provider = fakeProvider();
    const handler = createPasswordSignInHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/sign-in/password", { email: "not-an-email", password: "x" })
    );
    expect(response.status).toBe(400);
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns generic invalid credentials for an unknown email without calling the provider", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(undefined);
    const provider = fakeProvider();
    const handler = createPasswordSignInHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/sign-in/password", {
        email: "unknown@example.com",
        password: "correct-horse-battery",
      })
    );
    expect(response.status).toBe(401);
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
    });
  });

  it("returns generic invalid credentials for an inactive account without calling the provider", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue({
      userId,
      primaryEmail: "amit@example.com",
      status: "suspended",
    } as never);
    const provider = fakeProvider();
    const handler = createPasswordSignInHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/sign-in/password", {
        email: "amit@example.com",
        password: "correct-horse-battery",
      })
    );
    expect(response.status).toBe(401);
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
  });

  it("maps a rate-limited attempt to 429", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(activeAccount());
    const provider = fakeProvider();
    const handler = createPasswordSignInHandler({
      provider,
      repositories,
      appOrigin: origin,
      beforeAttempt: async () => {
        throw new AuthError("RATE_LIMITED", 429, "Rate limit exceeded");
      },
    });
    const response = await handler(
      request("/api/auth/sign-in/password", {
        email: "amit@example.com",
        password: "correct-horse-battery",
      })
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED", message: "Unable to continue" },
    });
    expect(provider.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns generic invalid credentials when the provider rejects the password", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(activeAccount());
    const provider = fakeProvider();
    provider.signInWithPassword.mockResolvedValue({ ok: false, setCookieHeaders: [] });
    const handler = createPasswordSignInHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/sign-in/password", {
        email: "amit@example.com",
        password: "wrong-password",
      })
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
    });
  });

  it("forwards set-cookie headers and disables caching on success", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(activeAccount());
    const provider = fakeProvider();
    provider.signInWithPassword.mockResolvedValue({
      ok: true,
      setCookieHeaders: ["__Secure-neon-auth.session=value; Path=/; HttpOnly; Secure"],
    });
    const handler = createPasswordSignInHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/sign-in/password", {
        email: "AMIT@example.com",
        password: "correct-horse-battery",
      })
    );
    expect(response.status).toBe(200);
    expect(provider.signInWithPassword).toHaveBeenCalledWith({
      email: "amit@example.com",
      password: "correct-horse-battery",
    });
    expect(response.headers.get("set-cookie")).toContain("__Secure-neon-auth.session=value");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ authenticated: true });
  });

  it("fails closed on infrastructure errors", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockRejectedValue(new Error("database down"));
    const provider = fakeProvider();
    const handler = createPasswordSignInHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/sign-in/password", {
        email: "amit@example.com",
        password: "correct-horse-battery",
      })
    );
    expect(response.status).toBe(503);
  });
});

describe("password reset request", () => {
  it("rejects a disallowed origin", async () => {
    const repositories = repository();
    const provider = fakeProvider();
    const handler = createPasswordResetRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
    });
    const response = await handler(
      new Request(`${origin}/api/auth/password/request-reset`, {
        method: "POST",
        headers: { origin: "https://hostile.example", "content-type": "application/json" },
        body: JSON.stringify({ email: "amit@example.com" }),
      })
    );
    expect(response.status).toBe(403);
  });

  it("rejects malformed input", async () => {
    const repositories = repository();
    const provider = fakeProvider();
    const handler = createPasswordResetRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
    });
    const response = await handler(request("/api/auth/password/request-reset", { email: "" }));
    expect(response.status).toBe(400);
  });

  it("does not disclose or dispatch for an unknown email", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(undefined);
    const provider = fakeProvider();
    const handler = createPasswordResetRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
    });
    const response = await handler(
      request("/api/auth/password/request-reset", { email: "unknown@example.com" })
    );
    expect(response.status).toBe(202);
    expect(provider.requestPasswordReset).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });

  it("does not disclose or dispatch when rate limited", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(activeAccount());
    const provider = fakeProvider();
    const handler = createPasswordResetRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
      beforeDispatch: async () => {
        throw new AuthError("RATE_LIMITED", 429, "Rate limit exceeded");
      },
    });
    const response = await handler(
      request("/api/auth/password/request-reset", { email: "amit@example.com" })
    );
    expect(response.status).toBe(202);
    expect(provider.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("does not disclose a provider rejection", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(activeAccount());
    const provider = fakeProvider();
    provider.requestPasswordReset.mockResolvedValue({ ok: false });
    const handler = createPasswordResetRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
    });
    const response = await handler(
      request("/api/auth/password/request-reset", { email: "amit@example.com" })
    );
    expect(response.status).toBe(202);
  });

  it("dispatches the provider reset for an active account with the app redirect", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockResolvedValue(activeAccount());
    const provider = fakeProvider();
    const handler = createPasswordResetRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
    });
    const response = await handler(
      request("/api/auth/password/request-reset", { email: "AMIT@example.com" })
    );
    expect(response.status).toBe(202);
    expect(provider.requestPasswordReset).toHaveBeenCalledWith({
      email: "amit@example.com",
      redirectTo: `${origin}/reset-password`,
    });
  });

  it("fails closed on infrastructure errors", async () => {
    const repositories = repository();
    repositories.findAccountByEmail.mockRejectedValue(new Error("database down"));
    const provider = fakeProvider();
    const handler = createPasswordResetRequestHandler({
      provider,
      repositories,
      appOrigin: origin,
    });
    const response = await handler(
      request("/api/auth/password/request-reset", { email: "amit@example.com" })
    );
    expect(response.status).toBe(503);
  });
});

describe("password reset", () => {
  it("rejects a disallowed origin", async () => {
    const provider = fakeProvider();
    const handler = createPasswordResetHandler({ provider, appOrigin: origin });
    const response = await handler(
      new Request(`${origin}/api/auth/password/reset`, {
        method: "POST",
        headers: { origin: "https://hostile.example", "content-type": "application/json" },
        body: JSON.stringify({ token: "t", newPassword: "a".repeat(PASSWORD_MIN_LENGTH) }),
      })
    );
    expect(response.status).toBe(403);
  });

  it("rejects a short new password", async () => {
    const provider = fakeProvider();
    const handler = createPasswordResetHandler({ provider, appOrigin: origin });
    const response = await handler(
      request("/api/auth/password/reset", { token: "t", newPassword: "short" })
    );
    expect(response.status).toBe(400);
    expect(provider.resetPassword).not.toHaveBeenCalled();
  });

  it("returns a generic invalid-link error when the provider rejects the token", async () => {
    const provider = fakeProvider();
    provider.resetPassword.mockResolvedValue({ ok: false });
    const handler = createPasswordResetHandler({ provider, appOrigin: origin });
    const response = await handler(
      request("/api/auth/password/reset", {
        token: "bad-token",
        newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "This reset link is invalid or has expired",
      },
    });
  });

  it("resets the password on provider success", async () => {
    const provider = fakeProvider();
    const handler = createPasswordResetHandler({ provider, appOrigin: origin });
    const response = await handler(
      request("/api/auth/password/reset", {
        token: "good-token",
        newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reset: true });
    expect(provider.resetPassword).toHaveBeenCalledWith({
      token: "good-token",
      newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
    });
  });

  it("fails closed on infrastructure errors", async () => {
    const provider = fakeProvider();
    provider.resetPassword.mockRejectedValue(new Error("provider unavailable"));
    const handler = createPasswordResetHandler({ provider, appOrigin: origin });
    const response = await handler(
      request("/api/auth/password/reset", {
        token: "t",
        newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      })
    );
    expect(response.status).toBe(503);
  });
});

describe("password change", () => {
  function sessionedProvider(): jest.Mocked<PasswordProvider> {
    const provider = fakeProvider();
    provider.getSession.mockResolvedValue({
      data: {
        user: { id: "provider-subject", email: "amit@example.com", emailVerified: true },
        session: { id: "22222222-2222-4222-8222-222222222222", createdAt: new Date() },
      },
      error: null,
    });
    return provider;
  }

  it("rejects a disallowed origin", async () => {
    const repositories = repository();
    const provider = sessionedProvider();
    const handler = createPasswordChangeHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      new Request(`${origin}/api/auth/password/change`, {
        method: "POST",
        headers: { origin: "https://hostile.example", "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: "old-password",
          newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
        }),
      })
    );
    expect(response.status).toBe(403);
  });

  it("requires a mapped active session and rejects when getSession returns no user", async () => {
    const repositories = repository();
    const provider = fakeProvider();
    provider.getSession.mockResolvedValue({ data: null, error: null });
    const handler = createPasswordChangeHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request(
        "/api/auth/password/change",
        { currentPassword: "old-password", newPassword: "a".repeat(PASSWORD_MIN_LENGTH) },
        { cookie: "session=value" }
      )
    );
    expect(response.status).toBe(401);
    expect(provider.changePassword).not.toHaveBeenCalled();
  });

  it("rejects malformed input and a short new password", async () => {
    const repositories = repository();
    repositories.findAccountByIdentity.mockResolvedValue({ userId, status: "active" } as never);
    const provider = sessionedProvider();
    const handler = createPasswordChangeHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/password/change", {
        currentPassword: "old-password",
        newPassword: "short",
      })
    );
    expect(response.status).toBe(400);
    expect(provider.changePassword).not.toHaveBeenCalled();
  });

  it("forwards the cookie header to the provider and revokes other sessions", async () => {
    const repositories = repository();
    repositories.findAccountByIdentity.mockResolvedValue({ userId, status: "active" } as never);
    const provider = sessionedProvider();
    provider.changePassword.mockResolvedValue({
      ok: true,
      setCookieHeaders: ["__Secure-neon-auth.session=new-value; Path=/; HttpOnly; Secure"],
    });
    const handler = createPasswordChangeHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request(
        "/api/auth/password/change",
        { currentPassword: "old-password", newPassword: "a".repeat(PASSWORD_MIN_LENGTH) },
        { cookie: "session=abc123" }
      )
    );
    expect(response.status).toBe(200);
    expect(provider.changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      revokeOtherSessions: true,
      cookieHeader: "session=abc123",
    });
    expect(response.headers.get("set-cookie")).toContain("__Secure-neon-auth.session=new-value");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ changed: true });
  });

  it("returns a generic error when the provider rejects the current password", async () => {
    const repositories = repository();
    repositories.findAccountByIdentity.mockResolvedValue({ userId, status: "active" } as never);
    const provider = sessionedProvider();
    provider.changePassword.mockResolvedValue({ ok: false, setCookieHeaders: [] });
    const handler = createPasswordChangeHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/password/change", {
        currentPassword: "wrong-password",
        newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("fails closed on infrastructure errors", async () => {
    const repositories = repository();
    repositories.findAccountByIdentity.mockRejectedValue(new Error("database down"));
    const provider = sessionedProvider();
    const handler = createPasswordChangeHandler({ provider, repositories, appOrigin: origin });
    const response = await handler(
      request("/api/auth/password/change", {
        currentPassword: "old-password",
        newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      })
    );
    expect(response.status).toBe(503);
  });
});

describe("neonPasswordProvider", () => {
  function auth(post: jest.Mock) {
    return { getSession: jest.fn(), handler: () => ({ POST: post }) };
  }

  it("builds the sign-in/email request with the app origin", async () => {
    const post = jest.fn().mockResolvedValue(Response.json({ ok: true }));
    const provider = neonPasswordProvider(auth(post), origin);
    await provider.signInWithPassword({ email: "amit@example.com", password: "secret-password" });
    const [signInRequest, context] = post.mock.calls[0];
    expect(signInRequest.method).toBe("POST");
    expect(signInRequest.url).toBe(`${origin}/api/auth/sign-in/email`);
    expect(signInRequest.headers.get("origin")).toBe(origin);
    expect(signInRequest.headers.get("content-type")).toBe("application/json");
    await expect(signInRequest.json()).resolves.toEqual({
      email: "amit@example.com",
      password: "secret-password",
    });
    await expect(context.params).resolves.toEqual({ path: ["sign-in", "email"] });
  });

  it("builds the request-password-reset request", async () => {
    const post = jest.fn().mockResolvedValue(Response.json({ ok: true }));
    const provider = neonPasswordProvider(auth(post), origin);
    await provider.requestPasswordReset({
      email: "amit@example.com",
      redirectTo: `${origin}/reset-password`,
    });
    const [resetRequest, context] = post.mock.calls[0];
    expect(resetRequest.url).toBe(`${origin}/api/auth/request-password-reset`);
    await expect(context.params).resolves.toEqual({ path: ["request-password-reset"] });
  });

  it("builds the reset-password request", async () => {
    const post = jest.fn().mockResolvedValue(Response.json({ ok: true }));
    const provider = neonPasswordProvider(auth(post), origin);
    await provider.resetPassword({ token: "abc", newPassword: "a".repeat(PASSWORD_MIN_LENGTH) });
    const [resetRequest, context] = post.mock.calls[0];
    expect(resetRequest.url).toBe(`${origin}/api/auth/reset-password`);
    await expect(context.params).resolves.toEqual({ path: ["reset-password"] });
  });

  it("builds the change-password request and forwards the cookie header", async () => {
    const post = jest.fn().mockResolvedValue(Response.json({ ok: true }));
    const provider = neonPasswordProvider(auth(post), origin);
    await provider.changePassword({
      currentPassword: "old",
      newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      revokeOtherSessions: true,
      cookieHeader: "session=abc",
    });
    const [changeRequest, context] = post.mock.calls[0];
    expect(changeRequest.url).toBe(`${origin}/api/auth/change-password`);
    expect(changeRequest.headers.get("cookie")).toBe("session=abc");
    await expect(changeRequest.json()).resolves.toEqual({
      currentPassword: "old",
      newPassword: "a".repeat(PASSWORD_MIN_LENGTH),
      revokeOtherSessions: true,
    });
    await expect(context.params).resolves.toEqual({ path: ["change-password"] });
  });

  it("reports ok:false and no cookies when the provider rejects", async () => {
    const post = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "denied" }), { status: 401 }));
    const provider = neonPasswordProvider(auth(post), origin);
    await expect(
      provider.signInWithPassword({ email: "amit@example.com", password: "wrong" })
    ).resolves.toEqual({ ok: false, setCookieHeaders: [] });
  });
});
