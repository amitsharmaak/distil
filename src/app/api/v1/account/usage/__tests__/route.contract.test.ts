jest.mock("@/lib/lifecycle/route-auth", () => ({ requireLifecycleRoute: jest.fn() }));
jest.mock("@/lib/lifecycle/usage", () => ({ getAccountUsage: jest.fn() }));

import { GET } from "@/app/api/v1/account/usage/route";
import { LifecycleError } from "@/lib/lifecycle/errors";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";
import { getAccountUsage } from "@/lib/lifecycle/usage";

const repositories = { lifecycle: {} };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireLifecycleRoute).mockResolvedValue({ repositories } as never);
  jest.mocked(getAccountUsage).mockResolvedValue({
    date: "2026-09-08",
    periodStart: "2026-09-01",
    limits: {},
    consumed: {},
    remaining: {},
    aiAvailable: true,
  });
});

describe("account usage route", () => {
  it("returns owner usage without caching", async () => {
    const request = new Request("https://distil.example/api/v1/account/usage");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireLifecycleRoute).toHaveBeenCalledWith(request);
    expect(getAccountUsage).toHaveBeenCalledWith(repositories);
    await expect(response.json()).resolves.toMatchObject({
      usage: { date: "2026-09-08", aiAvailable: true },
    });
  });

  it("returns the feature-disabled not-found contract", async () => {
    jest
      .mocked(requireLifecycleRoute)
      .mockRejectedValueOnce(new LifecycleError("NOT_FOUND", 404, "Not found"));
    const response = await GET(new Request("https://distil.example/api/v1/account/usage"));
    expect(response.status).toBe(404);
    expect(getAccountUsage).not.toHaveBeenCalled();
  });
});
