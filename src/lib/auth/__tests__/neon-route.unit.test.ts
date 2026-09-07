import { gatedNeonAuthHandler, isAllowedNeonAuthRoute } from "@/lib/auth/neon-route";

describe("Neon Auth route gate", () => {
  it("allows only magic-link verification and session lifecycle endpoints", () => {
    expect(isAllowedNeonAuthRoute(["magic-link", "verify"], "GET")).toBe(true);
    expect(isAllowedNeonAuthRoute(["list-sessions"], "GET")).toBe(true);
    expect(isAllowedNeonAuthRoute(["sign-in", "magic-link"], "POST")).toBe(false);
    expect(isAllowedNeonAuthRoute(["sign-in", "email"], "POST")).toBe(false);
    expect(isAllowedNeonAuthRoute(["sign-up", "email"], "POST")).toBe(false);
    expect(isAllowedNeonAuthRoute(["delete-user"], "POST")).toBe(false);
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
});
