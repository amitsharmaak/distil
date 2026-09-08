jest.mock("@/lib/lifecycle/route-auth", () => ({ requireLifecycleRoute: jest.fn() }));

import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

import { GET } from "../route";

const ownerId = "11111111-1111-4111-8111-111111111111";
const listExports = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  listExports.mockResolvedValue([
    {
      id: "55555555-5555-4555-8555-555555555555",
      userId: ownerId,
      status: "running",
      idempotencyKey: "private-idempotency-key",
      manifestVersion: 1,
      objectRef: "private-object-reference",
      requestedAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:01:00.000Z",
      downloadExpiresAt: "2026-09-09T00:00:00.000Z",
      purgeAfter: "2026-09-15T00:00:00.000Z",
    },
  ]);
  jest.mocked(requireLifecycleRoute).mockResolvedValue({
    repositories: { lifecycle: { listExports } },
  } as never);
});

describe("account export list route", () => {
  it("hydrates only sanitized caller-owned export status", async () => {
    const request = new Request("https://distil.example/api/v1/account/exports");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(requireLifecycleRoute).toHaveBeenCalledWith(request);
    expect(listExports).toHaveBeenCalledWith({ limit: 20 });
    const payload = await response.json();
    expect(payload).toEqual({
      exports: [
        expect.objectContaining({
          id: "55555555-5555-4555-8555-555555555555",
          status: "running",
        }),
      ],
    });
    expect(JSON.stringify(payload)).not.toContain(ownerId);
    expect(JSON.stringify(payload)).not.toContain("private-idempotency-key");
    expect(JSON.stringify(payload)).not.toContain("private-object-reference");
  });
});
