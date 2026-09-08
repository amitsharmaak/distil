jest.mock("@/lib/lifecycle/route-auth", () => ({ requireLifecycleRoute: jest.fn() }));

import { GET } from "@/app/api/v1/account/exports/[id]/route";
import { LifecycleError } from "@/lib/lifecycle/errors";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

const id = "55555555-5555-4555-8555-555555555555";
const ownerId = "11111111-1111-4111-8111-111111111111";
const findExport = jest.fn();
const record = {
  id,
  userId: ownerId,
  status: "ready",
  idempotencyKey: "private-key",
  manifestVersion: 1,
  objectRef: "private-object-ref",
  requestedAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:01:00.000Z",
  completedAt: "2026-09-08T00:01:00.000Z",
  downloadExpiresAt: "2026-09-09T00:00:00.000Z",
  purgeAfter: "2026-09-15T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  findExport.mockResolvedValue(record);
  jest.mocked(requireLifecycleRoute).mockResolvedValue({
    repositories: { lifecycle: { findExport } },
  } as never);
});

describe("account export status route", () => {
  it("returns a sanitized owner export status without caching", async () => {
    const request = new Request(`https://distil.example/api/v1/account/exports/${id}`);
    const response = await GET(request, { params: Promise.resolve({ id }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireLifecycleRoute).toHaveBeenCalledWith(request);
    expect(findExport).toHaveBeenCalledWith(id);
    const payload = await response.json();
    expect(payload.export).toMatchObject({ id, status: "ready" });
    expect(JSON.stringify(payload)).not.toContain(ownerId);
    expect(JSON.stringify(payload)).not.toContain("private-object-ref");
  });

  it("rejects malformed IDs before auth and conceals missing owner records", async () => {
    const malformed = await GET(
      new Request("https://distil.example/api/v1/account/exports/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(malformed.status).toBe(400);
    expect(requireLifecycleRoute).not.toHaveBeenCalled();

    findExport.mockResolvedValueOnce(undefined);
    const missing = await GET(new Request(`https://distil.example/api/v1/account/exports/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "Export not found" },
    });
  });

  it("keeps feature-disabled responses typed as not found", async () => {
    jest
      .mocked(requireLifecycleRoute)
      .mockRejectedValueOnce(new LifecycleError("NOT_FOUND", 404, "Not found"));
    const response = await GET(new Request(`https://distil.example/api/v1/account/exports/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(404);
    expect(findExport).not.toHaveBeenCalled();
  });
});
