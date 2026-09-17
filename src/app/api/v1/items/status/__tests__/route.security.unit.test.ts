jest.mock("@/lib/auth/tenant-route", () => {
  const actual = jest.requireActual("@/lib/auth/tenant-route");
  return { ...actual, requireTenantRoute: jest.fn() };
});

import { GET } from "../route";
import { AccessDeniedError } from "@/lib/auth/account";
import { requireTenantRoute } from "@/lib/auth/tenant-route";

const listProcessingStatuses = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireTenantRoute).mockResolvedValue({
    context: {
      userId: "11111111-1111-4111-8111-111111111111",
      actorKind: "user",
      actorId: "11111111-1111-4111-8111-111111111111",
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
    repositories: { items: { listProcessingStatuses } },
  } as never);
});

describe("GET /api/v1/items/status", () => {
  it("returns the owner-scoped status projection", async () => {
    listProcessingStatuses.mockResolvedValue([
      { id: "owner-1", processingStatus: "processing" },
      { id: "owner-2", processingStatus: "ready" },
    ]);

    const response = await GET(
      new Request("https://distil.example/api/v1/items/status?ids=owner-1,owner-2")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        { id: "owner-1", processingStatus: "processing" },
        { id: "owner-2", processingStatus: "ready" },
      ],
    });
    expect(listProcessingStatuses).toHaveBeenCalledWith(["owner-1", "owner-2"]);
  });

  it("returns 401 for an anonymous request", async () => {
    jest.mocked(requireTenantRoute).mockRejectedValueOnce(new AccessDeniedError("unauthenticated"));

    const response = await GET(
      new Request("https://distil.example/api/v1/items/status?ids=owner-1")
    );

    expect(response.status).toBe(401);
    expect(listProcessingStatuses).not.toHaveBeenCalled();
  });

  it("omits foreign and missing ids returned as absent by the tenant repository", async () => {
    listProcessingStatuses.mockResolvedValue([{ id: "owner-1", processingStatus: "ready" }]);

    const response = await GET(
      new Request("https://distil.example/api/v1/items/status?ids=owner-1,foreign-1,missing-1")
    );

    await expect(response.json()).resolves.toEqual({
      items: [{ id: "owner-1", processingStatus: "ready" }],
    });
  });

  it.each([
    "https://distil.example/api/v1/items/status",
    "https://distil.example/api/v1/items/status?ids=one,,two",
    `https://distil.example/api/v1/items/status?ids=${Array.from(
      { length: 51 },
      (_, index) => `item-${index}`
    ).join(",")}`,
  ])("rejects malformed input before repository access", async (url) => {
    const response = await GET(new Request(url));

    expect(response.status).toBe(400);
    expect(requireTenantRoute).not.toHaveBeenCalled();
    expect(listProcessingStatuses).not.toHaveBeenCalled();
  });
});
