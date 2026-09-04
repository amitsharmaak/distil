jest.mock("@/lib/database", () => ({ getRepositorySet: jest.fn() }));
jest.mock("@/lib/queue/dispatchers", () => ({ createVercelCaptureDispatcher: jest.fn() }));
jest.mock("@/lib/auth", () => ({ resolveCapturePrincipal: jest.fn() }));
jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: jest.fn(() => ({
    sessionSecret: "test-secret",
    allowedOrigins: new Set(["https://distil.test"]),
  })),
}));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));

import { resolveCapturePrincipal } from "@/lib/auth";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getRepositorySet } from "@/lib/database";
import { createVercelCaptureDispatcher } from "@/lib/queue/dispatchers";
import { composeCaptureRoutes } from "../composition";

describe("capture route composition", () => {
  beforeEach(() => jest.clearAllMocks());

  it("composes repository-backed service with capture authentication", async () => {
    const captures = {};
    const captureTokens = {};
    const rateLimits = {};
    const dispatcher = { dispatch: jest.fn() };
    (getRepositorySet as jest.Mock).mockResolvedValue({ captures, captureTokens, rateLimits });
    (createVercelCaptureDispatcher as jest.Mock).mockResolvedValue(dispatcher);
    (resolveCapturePrincipal as jest.Mock).mockResolvedValue({
      kind: "capture-token",
      tokenId: "token-1",
    });
    const composition = await composeCaptureRoutes();
    expect(composition.service).toBeDefined();
    await expect(
      composition.authenticate(new Request("http://localhost", { method: "POST" }))
    ).resolves.toEqual({ kind: "capture-token", tokenId: "token-1" });
    expect(resolveCapturePrincipal).toHaveBeenCalledWith(expect.any(Request), {
      captureTokens,
      rateLimits,
      sessionSecret: "test-secret",
    });
    expect(requireAllowedOrigin).not.toHaveBeenCalled();
    expect(getRepositorySet).toHaveBeenCalledTimes(1);
    expect(createVercelCaptureDispatcher).toHaveBeenCalledTimes(1);
  });

  it("enforces an allowed origin for session mutations", async () => {
    (getRepositorySet as jest.Mock).mockResolvedValue({
      captures: {},
      captureTokens: {},
      rateLimits: {},
    });
    (createVercelCaptureDispatcher as jest.Mock).mockResolvedValue({ dispatch: jest.fn() });
    (resolveCapturePrincipal as jest.Mock).mockResolvedValue({ kind: "session" });
    const composition = await composeCaptureRoutes();
    const request = new Request("https://distil.test/api/v1/captures", {
      method: "POST",
      headers: { origin: "https://distil.test" },
    });

    await composition.authenticate(request);

    expect(requireAllowedOrigin).toHaveBeenCalledWith(request, new Set(["https://distil.test"]));
  });

  it("does not require an origin for session reads", async () => {
    (getRepositorySet as jest.Mock).mockResolvedValue({
      captures: {},
      captureTokens: {},
      rateLimits: {},
    });
    (createVercelCaptureDispatcher as jest.Mock).mockResolvedValue({ dispatch: jest.fn() });
    (resolveCapturePrincipal as jest.Mock).mockResolvedValue({ kind: "session" });
    const composition = await composeCaptureRoutes();

    await composition.authenticate(new Request("https://distil.test/api/v1/captures"));

    expect(requireAllowedOrigin).not.toHaveBeenCalled();
  });
});
