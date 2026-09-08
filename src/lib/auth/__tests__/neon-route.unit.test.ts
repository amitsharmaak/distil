import {
  dispatchGatedNeonAuth,
  gatedNeonAuthHandler,
  isAllowedNeonAuthRoute,
  type NeonAuthHandler,
} from "@/lib/auth/neon-route";

describe("Neon Auth route gate", () => {
  it("allows only magic-link verification and session lifecycle endpoints", () => {
    expect(isAllowedNeonAuthRoute(["magic-link", "verify"], "GET")).toBe(true);
    expect(isAllowedNeonAuthRoute(["list-sessions"], "GET")).toBe(false);
    expect(isAllowedNeonAuthRoute(["sign-in", "magic-link"], "POST")).toBe(false);
    expect(isAllowedNeonAuthRoute(["sign-in", "email"], "POST")).toBe(false);
    expect(isAllowedNeonAuthRoute(["sign-up", "email"], "POST")).toBe(false);
    expect(isAllowedNeonAuthRoute(["delete-user"], "POST")).toBe(false);
    expect(isAllowedNeonAuthRoute(["invitations", "issue"], "POST")).toBe(false);
  });

  it("does not invoke the provider for a blocked path", async () => {
    const provider = jest.fn(async () => Response.json({ ok: true }));
    const response = await gatedNeonAuthHandler(provider)(
      new Request("https://distil.example/api/auth/sign-up/email", { method: "POST" }),
      { params: Promise.resolve({ path: ["sign-up", "email"] }) }
    );
    expect(response.status).toBe(404);
    expect(provider).not.toHaveBeenCalled();
  });

  it("delegates allowed paths through the simple gate", async () => {
    const provider = jest.fn<Promise<Response>, Parameters<NeonAuthHandler>>(async () =>
      Response.json({ ok: true })
    );
    const response = await gatedNeonAuthHandler(provider)(
      new Request("https://distil.example/api/auth/get-session"),
      { params: Promise.resolve({ path: ["get-session"] }) }
    );
    expect(response.status).toBe(200);
    expect(provider).toHaveBeenCalledWith(expect.any(Request), {
      params: expect.any(Promise),
    });
    await expect(provider.mock.calls[0]![1].params).resolves.toEqual({ path: ["get-session"] });
  });

  it("rejects blocked paths before constructing the SDK adapter", async () => {
    const loadHandler = jest.fn();
    const loadAllowedOrigins = jest.fn(() => new Set(["https://distil.example"]));
    const response = await dispatchGatedNeonAuth(
      new Request("https://distil.example/api/auth/sign-up/email", { method: "POST" }),
      { params: Promise.resolve({ path: ["sign-up", "email"] }) },
      { loadAllowedOrigins, loadHandler }
    );
    expect(response.status).toBe(404);
    expect(loadAllowedOrigins).not.toHaveBeenCalled();
    expect(loadHandler).not.toHaveBeenCalled();
  });

  it("requires an exact allowed origin before state-changing provider dispatch", async () => {
    const provider = jest.fn(async () => Response.json({ ok: true }));
    const loadHandler = jest.fn(() => provider);
    for (const origin of [undefined, "https://hostile.example", "https://distil.example.evil"]) {
      const headers = new Headers();
      if (origin) headers.set("origin", origin);
      await expect(
        dispatchGatedNeonAuth(
          new Request("https://distil.example/api/auth/sign-out", { method: "POST", headers }),
          { params: Promise.resolve({ path: ["sign-out"] }) },
          { loadAllowedOrigins: () => new Set(["https://distil.example"]), loadHandler }
        )
      ).rejects.toEqual(expect.objectContaining({ code: "ORIGIN_NOT_ALLOWED" }));
    }
    expect(loadHandler).not.toHaveBeenCalled();

    const allowed = await dispatchGatedNeonAuth(
      new Request("https://distil.example/api/auth/sign-out", {
        method: "POST",
        headers: { origin: "https://distil.example" },
      }),
      { params: Promise.resolve({ path: ["sign-out"] }) },
      { loadAllowedOrigins: () => new Set(["https://distil.example"]), loadHandler }
    );
    expect(allowed.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("rejects magic-link redirects outside the fixed application callback", async () => {
    const loadHandler = jest.fn();
    await expect(
      dispatchGatedNeonAuth(
        new Request(
          "https://distil.example/api/auth/magic-link/verify?token=x&callbackURL=https%3A%2F%2Fhostile.example%2Fsteal"
        ),
        { params: Promise.resolve({ path: ["magic-link", "verify"] }) },
        { loadAllowedOrigins: () => new Set(["https://distil.example"]), loadHandler }
      )
    ).rejects.toThrow("Invalid auth callback");
    expect(loadHandler).not.toHaveBeenCalled();
  });

  it("rejects malformed callback URLs and same-origin callbacks with the wrong path", async () => {
    const dependencies = {
      loadAllowedOrigins: () => new Set(["https://distil.example"]),
      loadHandler: jest.fn(),
    };
    for (const callbackURL of ["not a url", "https://distil.example/unexpected"]) {
      await expect(
        dispatchGatedNeonAuth(
          new Request(
            `https://distil.example/api/auth/magic-link/verify?callbackURL=${encodeURIComponent(callbackURL)}`
          ),
          { params: Promise.resolve({ path: ["magic-link", "verify"] }) },
          dependencies
        )
      ).rejects.toEqual(expect.objectContaining({ code: "ORIGIN_NOT_ALLOWED" }));
    }
    expect(dependencies.loadHandler).not.toHaveBeenCalled();
  });

  it("allows each fixed magic-link callback and returns 405 without a method handler", async () => {
    const requestUrl = new URL("https://distil.example/api/auth/magic-link/verify");
    requestUrl.searchParams.set(
      "callbackURL",
      "https://distil.example/api/auth/invitations/complete"
    );
    requestUrl.searchParams.set(
      "newUserCallbackURL",
      "https://distil.example/api/auth/invitations/complete"
    );
    requestUrl.searchParams.set("errorCallbackURL", "https://distil.example/access-denied");
    const response = await dispatchGatedNeonAuth(
      new Request(requestUrl),
      { params: Promise.resolve({ path: ["magic-link", "verify"] }) },
      {
        loadAllowedOrigins: () => new Set(["https://distil.example"]),
        loadHandler: jest.fn(() => undefined),
      }
    );
    expect(response.status).toBe(405);
  });

  it("allows the fixed same-origin reauthentication callback", async () => {
    const requestUrl = new URL("https://distil.example/api/auth/magic-link/verify");
    requestUrl.searchParams.set("callbackURL", "https://distil.example/account?reauthenticated=1");
    requestUrl.searchParams.set("newUserCallbackURL", "https://distil.example/access-denied");
    requestUrl.searchParams.set("errorCallbackURL", "https://distil.example/access-denied");
    const handler = jest.fn(async () => new Response(null, { status: 204 }));
    const response = await dispatchGatedNeonAuth(
      new Request(requestUrl),
      { params: Promise.resolve({ path: ["magic-link", "verify"] }) },
      {
        loadAllowedOrigins: () => new Set(["https://distil.example"]),
        loadHandler: jest.fn(() => handler),
      }
    );
    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not load origins for the read-only session endpoint", async () => {
    const loadAllowedOrigins = jest.fn(() => new Set(["https://distil.example"]));
    const handler = jest.fn(async () => new Response(null, { status: 204 }));
    const response = await dispatchGatedNeonAuth(
      new Request("https://distil.example/api/auth/get-session"),
      { params: Promise.resolve({ path: ["get-session"] }) },
      { loadAllowedOrigins, loadHandler: jest.fn(() => handler) }
    );
    expect(response.status).toBe(204);
    expect(loadAllowedOrigins).not.toHaveBeenCalled();
  });
});
