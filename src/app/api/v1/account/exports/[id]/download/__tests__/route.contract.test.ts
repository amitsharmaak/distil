jest.mock("@/lib/lifecycle/route-auth", () => ({ requireLifecycleRoute: jest.fn() }));
jest.mock("@/lib/lifecycle/exports", () => ({ readAccountExportDownload: jest.fn() }));
jest.mock("@/lib/lifecycle/object-store-runtime", () => ({
  getLifecycleObjectStore: jest.fn(),
}));

import { GET } from "@/app/api/v1/account/exports/[id]/download/route";
import { LifecycleError } from "@/lib/lifecycle/errors";
import { readAccountExportDownload } from "@/lib/lifecycle/exports";
import { getLifecycleObjectStore } from "@/lib/lifecycle/object-store-runtime";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

const id = "55555555-5555-4555-8555-555555555555";
const context = { userId: "11111111-1111-4111-8111-111111111111" };
const repositories = { lifecycle: {} };
const objectStore = {};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireLifecycleRoute).mockResolvedValue({ context, repositories } as never);
  jest.mocked(getLifecycleObjectStore).mockReturnValue(objectStore as never);
  jest.mocked(readAccountExportDownload).mockResolvedValue({
    record: { id },
    object: {
      body: new TextEncoder().encode("private zip"),
      sizeBytes: 11,
      contentHash: "hash",
    },
  } as never);
});

describe("account export download route", () => {
  it("streams the verified owner archive with hardened headers", async () => {
    const request = new Request(`https://distil.example/api/v1/account/exports/${id}/download`);
    const response = await GET(request, { params: Promise.resolve({ id }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-length")).toBe("11");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="distil-export-${id}.zip"`
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("private zip");
    expect(readAccountExportDownload).toHaveBeenCalledWith(context, repositories, objectStore, id);
  });

  it("rejects malformed IDs and preserves typed readiness errors", async () => {
    const malformed = await GET(
      new Request("https://distil.example/api/v1/account/exports/nope/download"),
      { params: Promise.resolve({ id: "nope" }) }
    );
    expect(malformed.status).toBe(400);
    expect(requireLifecycleRoute).not.toHaveBeenCalled();

    jest
      .mocked(readAccountExportDownload)
      .mockRejectedValueOnce(new LifecycleError("NOT_READY", 409, "Export is not ready"));
    const notReady = await GET(
      new Request(`https://distil.example/api/v1/account/exports/${id}/download`),
      { params: Promise.resolve({ id }) }
    );
    expect(notReady.status).toBe(409);
    await expect(notReady.json()).resolves.toEqual({
      error: { code: "NOT_READY", message: "Export is not ready" },
    });
  });

  it("does not resolve storage when lifecycle is disabled", async () => {
    jest
      .mocked(requireLifecycleRoute)
      .mockRejectedValueOnce(new LifecycleError("NOT_FOUND", 404, "Not found"));
    const response = await GET(
      new Request(`https://distil.example/api/v1/account/exports/${id}/download`),
      { params: Promise.resolve({ id }) }
    );
    expect(response.status).toBe(404);
    expect(getLifecycleObjectStore).not.toHaveBeenCalled();
  });
});
