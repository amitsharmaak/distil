jest.mock("@/lib/database", () => ({
  getTenantRepositories: jest.fn(),
  getCaptureTokenIdentityResolver: jest.fn(),
}));
jest.mock("@/lib/queue/dispatchers", () => ({ createVercelCaptureDispatcher: jest.fn() }));
jest.mock("@/lib/auth", () => ({ resolveCapturePrincipal: jest.fn() }));
jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: jest.fn(() => ({ allowedOrigins: new Set(["https://distil.test"]) })),
}));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));

import { resolveCapturePrincipal } from "@/lib/auth";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getCaptureTokenIdentityResolver, getTenantRepositories } from "@/lib/database";
import { createVercelCaptureDispatcher } from "@/lib/queue/dispatchers";
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
    await composition.authenticate(
      new Request("https://distil.test/api/v1/captures", { method: "POST" })
    );
    expect(requireAllowedOrigin).not.toHaveBeenCalled();
  });
});
