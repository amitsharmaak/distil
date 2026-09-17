jest.mock("@/lib/database", () => ({
  getTenantRepositories: jest.fn(),
  getCaptureTokenIdentityResolver: jest.fn(),
}));
jest.mock("@/lib/queue/dispatchers", () => ({
  createVercelCaptureDispatcher: jest.fn(),
  InlineCaptureDispatcher: jest.fn(),
}));
jest.mock("@/lib/queue/capture-consumer", () => ({ consumeCaptureMessage: jest.fn() }));
jest.mock("@/lib/config", () => ({ config: { captureDispatch: "queue" } }));
jest.mock("@/lib/auth", () => ({ resolveCapturePrincipal: jest.fn() }));
jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: jest.fn(() => ({ allowedOrigins: new Set(["https://distil.test"]) })),
}));
jest.mock("@/lib/auth/origin", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth/origin")>("@/lib/auth/origin");
  return { requireAllowedOrigin: jest.fn(actual.requireAllowedOrigin) };
});

import { resolveCapturePrincipal } from "@/lib/auth";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getCaptureTokenIdentityResolver, getTenantRepositories } from "@/lib/database";
import { config } from "@/lib/config";
import { consumeCaptureMessage } from "@/lib/queue/capture-consumer";
import { createVercelCaptureDispatcher, InlineCaptureDispatcher } from "@/lib/queue/dispatchers";
import { composeCaptureRoutes } from "../composition";
import { context } from "./fixtures";

describe("capture route composition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getCaptureTokenIdentityResolver).mockResolvedValue({
      resolveActiveByHash: jest.fn(),
    });
    jest.mocked(createVercelCaptureDispatcher).mockResolvedValue({ dispatch: jest.fn() } as never);
    jest.mocked(getTenantRepositories).mockResolvedValue({ captures: {} } as never);
  });

  it("uses the Vercel queue dispatcher by default", async () => {
    await composeCaptureRoutes();
    expect(createVercelCaptureDispatcher).toHaveBeenCalledTimes(1);
    expect(InlineCaptureDispatcher).not.toHaveBeenCalled();
  });

  it("runs captures in-process when DISTIL_CAPTURE_DISPATCH is inline", async () => {
    (config as { captureDispatch: string }).captureDispatch = "inline";
    try {
      await composeCaptureRoutes();
      expect(createVercelCaptureDispatcher).not.toHaveBeenCalled();
      expect(InlineCaptureDispatcher).toHaveBeenCalledWith(
        consumeCaptureMessage,
        expect.any(Function)
      );
    } finally {
      (config as { captureDispatch: string }).captureDispatch = "queue";
    }
  });

  it("opens tenant repositories only after authentication supplies AuthContext", async () => {
    jest.mocked(resolveCapturePrincipal).mockResolvedValue({ kind: "session", context });
    const composition = await composeCaptureRoutes();
    expect(getTenantRepositories).not.toHaveBeenCalled();
    await composition.service(context);
    expect(getTenantRepositories).toHaveBeenCalledWith(context);
  });

  it("enforces an allowed origin for session mutations", async () => {
    jest.mocked(resolveCapturePrincipal).mockResolvedValue({ kind: "session", context });
    const composition = await composeCaptureRoutes();
    const request = new Request("https://distil.test/api/v1/captures", {
      method: "POST",
      headers: { origin: "https://distil.test" },
    });
    await composition.authenticate(request);
    expect(requireAllowedOrigin).toHaveBeenCalledWith(request, new Set(["https://distil.test"]));
  });

  it.each([undefined, "https://hostile.example"])(
    "rejects a session mutation with %s Origin",
    async (origin) => {
      jest.mocked(resolveCapturePrincipal).mockResolvedValue({ kind: "session", context });
      const composition = await composeCaptureRoutes();
      const request = new Request("https://distil.test/api/v1/captures", {
        method: "POST",
        ...(origin ? { headers: { origin } } : {}),
      });
      await expect(composition.authenticate(request)).rejects.toMatchObject({
        code: "ORIGIN_NOT_ALLOWED",
        status: 403,
      });
    }
  );

  it("does not require an origin for session reads or capture-token writes", async () => {
    const composition = await composeCaptureRoutes();
    jest.mocked(resolveCapturePrincipal).mockResolvedValue({ kind: "session", context });
    await composition.authenticate(new Request("https://distil.test/api/v1/captures"));
    jest.mocked(resolveCapturePrincipal).mockResolvedValue({
      kind: "capture-token",
      context: { ...context, actorKind: "capture-token" },
      userId: context.userId,
      tokenId: context.actorId,
    });
    for (const origin of [undefined, "https://hostile.example"] as const) {
      await expect(
        composition.authenticate(
          new Request("https://distil.test/api/v1/captures", {
            method: "POST",
            ...(origin ? { headers: { origin } } : {}),
          })
        )
      ).resolves.toMatchObject({ kind: "capture-token" });
    }
    expect(requireAllowedOrigin).not.toHaveBeenCalled();
  });
});
