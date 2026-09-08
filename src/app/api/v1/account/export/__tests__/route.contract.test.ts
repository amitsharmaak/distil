jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: () => ({ allowedOrigins: new Set(["https://distil.example"]) }),
}));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/lifecycle/route-auth", () => ({ requireLifecycleRoute: jest.fn() }));
jest.mock("@/lib/lifecycle/exports", () => {
  const actual =
    jest.requireActual<typeof import("@/lib/lifecycle/exports")>("@/lib/lifecycle/exports");
  return { ...actual, requestAccountExport: jest.fn() };
});
jest.mock("@/lib/queue/dispatchers", () => ({
  createVercelTenantJobDispatcher: jest.fn(),
}));

import { requireAllowedOrigin } from "@/lib/auth/origin";
import { POST } from "@/app/api/v1/account/export/route";
import { LifecycleError } from "@/lib/lifecycle/errors";
import { requestAccountExport } from "@/lib/lifecycle/exports";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";
import { createVercelTenantJobDispatcher } from "@/lib/queue/dispatchers";

const context = { userId: "11111111-1111-4111-8111-111111111111" };
const repositories = { lifecycle: {} };
const dispatcher = jest.fn();
const record = {
  id: "55555555-5555-4555-8555-555555555555",
  userId: context.userId,
  status: "queued",
  idempotencyKey: "private-key",
  manifestVersion: 1,
  objectRef: "private-object-ref",
  requestedAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  downloadExpiresAt: "2026-09-09T00:00:00.000Z",
  purgeAfter: "2026-09-15T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireLifecycleRoute).mockResolvedValue({ context, repositories } as never);
  jest.mocked(createVercelTenantJobDispatcher).mockResolvedValue(dispatcher as never);
  jest.mocked(requestAccountExport).mockResolvedValue({
    export: record,
    jobId: record.id,
    created: true,
  } as never);
});

describe("account export request route", () => {
  it("creates a sanitized owner export under Origin and fresh-auth checks", async () => {
    const request = new Request("https://distil.example/api/v1/account/export", {
      method: "POST",
      headers: {
        origin: "https://distil.example",
        "idempotency-key": "request-key-123",
      },
    });
    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireAllowedOrigin).toHaveBeenCalledWith(request, new Set(["https://distil.example"]));
    expect(requireLifecycleRoute).toHaveBeenCalledWith(request, { fresh: true });
    expect(requestAccountExport).toHaveBeenCalledWith(context, repositories, {
      idempotencyKey: "request-key-123",
      dispatcher,
    });
    const payload = await response.json();
    expect(payload).toMatchObject({
      export: { id: record.id, status: "queued" },
      job: { id: record.id },
      created: true,
    });
    expect(JSON.stringify(payload)).not.toContain("private-key");
    expect(JSON.stringify(payload)).not.toContain("private-object-ref");
  });

  it("returns typed request and feature-disabled failures before dispatch", async () => {
    jest
      .mocked(requestAccountExport)
      .mockRejectedValueOnce(
        new LifecycleError("INVALID_REQUEST", 400, "A valid Idempotency-Key is required")
      );
    const invalid = await POST(
      new Request("https://distil.example/api/v1/account/export", { method: "POST" })
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: { code: "INVALID_REQUEST", message: "A valid Idempotency-Key is required" },
    });

    jest
      .mocked(requireLifecycleRoute)
      .mockRejectedValueOnce(new LifecycleError("NOT_FOUND", 404, "Not found"));
    const disabled = await POST(
      new Request("https://distil.example/api/v1/account/export", { method: "POST" })
    );
    expect(disabled.status).toBe(404);
    expect(createVercelTenantJobDispatcher).toHaveBeenCalledTimes(1);
  });
});
