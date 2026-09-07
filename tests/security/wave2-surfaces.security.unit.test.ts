jest.mock("@/lib/auth/tenant-route", () => ({
  requireTenantRoute: jest.fn(),
  tenantRouteFailureResponse: jest.fn(() => Response.json({ error: "denied" }, { status: 401 })),
}));

import { requireTenantRoute } from "@/lib/auth/tenant-route";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { PATCH as notificationPatch } from "@/app/api/notifications/[id]/route";
import { GET as connectorStatus } from "@/app/api/auth/gmail/status/route";

const tenantRoute = jest.mocked(requireTenantRoute);
const repositories = {
  notifications: {
    list: jest.fn(),
    unreadCount: jest.fn(),
    find: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
  settings: { get: jest.fn(), set: jest.fn() },
};

describe("Wave 2 tenant surface boundaries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tenantRoute.mockResolvedValue({ context: {} as never, repositories: repositories as never });
  });

  it("uses the tenant-bound notification repository instead of a caller-selected account", async () => {
    repositories.notifications.list.mockResolvedValue([
      {
        id: "own",
        itemId: "item",
        title: "Own",
        message: "",
        isRead: false,
        createdAt: "2026-09-07T00:00:00.000Z",
      },
    ]);
    repositories.notifications.unreadCount.mockResolvedValue(1);
    const response = await notificationsGet(
      new Request("https://distil.example/api/notifications")
    );
    expect(response.status).toBe(200);
    expect(tenantRoute).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ unreadCount: 1, notifications: [{ id: "own" }] });
  });

  it("conceals a cross-tenant notification id as 404 before mutating", async () => {
    repositories.notifications.find.mockResolvedValue(undefined);
    const response = await notificationPatch(
      new Request("https://distil.example/api/notifications/other"),
      { params: Promise.resolve({ id: "other" }) }
    );
    expect(response.status).toBe(404);
    expect(repositories.notifications.markRead).not.toHaveBeenCalled();
  });

  it("does not expose a connector status path until its tenant worker exists", async () => {
    const response = await connectorStatus(
      new Request("https://distil.example/api/auth/gmail/status")
    );
    expect(response.status).toBe(404);
    expect(tenantRoute).toHaveBeenCalledTimes(1);
  });
});
