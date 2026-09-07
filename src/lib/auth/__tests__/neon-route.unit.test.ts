import {
  dispatchGatedNeonAuth,
  gatedNeonAuthHandler,
  isAllowedNeonAuthRoute,
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
});
