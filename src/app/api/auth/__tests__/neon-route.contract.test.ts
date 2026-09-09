jest.mock("@/lib/auth/neon-server", () => ({
  getNeonAuthServer: jest.fn(),
  NeonAuthConfigurationError: class NeonAuthConfigurationError extends Error {},
}));
jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: jest.fn(() => ({
    allowedOrigins: new Set(["https://distil.example"]),
  })),
}));

import { POST } from "@/app/api/auth/[...path]/route";
import { getNeonAuthServer } from "@/lib/auth/neon-server";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe("hosted-auth catch-all route", () => {
  beforeEach(() => {
    jest.mocked(getNeonAuthServer).mockReturnValue({
      handler: () => ({ POST: jest.fn(async () => Response.json({ ok: true })) }),
    } as never);
  });

  it("maps an asynchronously rejected origin to a generic non-cacheable 403", async () => {
    const response = await POST(
      new Request("https://distil.example/api/auth/sign-out", {
        method: "POST",
        headers: { origin: "https://hostile.example" },
      }),
      context(["sign-out"])
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: { code: "ORIGIN_NOT_ALLOWED", message: "Unable to continue" },
    });
    expect(getNeonAuthServer).not.toHaveBeenCalled();
  });

  it("marks blocked auth surfaces private and non-cacheable", async () => {
    const response = await POST(
      new Request("https://distil.example/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin: "https://distil.example" },
      }),
      context(["sign-up", "email"])
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getNeonAuthServer).not.toHaveBeenCalled();
  });
});
