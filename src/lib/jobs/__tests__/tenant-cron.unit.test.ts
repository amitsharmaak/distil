import { createSystemContext, userIdSchema } from "@/lib/contracts/tenant-context";
import { forEachActiveTenant } from "../tenant-cron";

describe("tenant cron fan-out", () => {
  it("paginates opaque users and opens one tenant repository set per user", async () => {
    const users = [
      userIdSchema.parse("10000000-0000-4000-8000-000000000010"),
      userIdSchema.parse("20000000-0000-4000-8000-000000000020"),
    ];
    const listActiveUserIds = jest.fn().mockResolvedValueOnce(users).mockResolvedValueOnce([]);
    const getTenantRepositories = jest.fn(async (context) => ({ owner: context.userId }) as never);
    const operation = jest.fn(async (context) => context.userId === users[0]);
    const system = createSystemContext({
      actorKind: "system",
      actorId: "00000000-0000-4000-8000-000000000004",
      requestId: "10000000-0000-4000-8000-000000000011",
    });

    await expect(
      forEachActiveTenant(
        system,
        {
          getControlPlaneRepositories: jest.fn().mockResolvedValue({
            accounts: { listActiveUserIds },
          }),
          getTenantRepositories,
        } as never,
        operation,
        2
      )
    ).resolves.toEqual({ visited: 2, enqueued: 1 });
    expect(getTenantRepositories.mock.calls.map(([context]) => context.userId)).toEqual(users);
    expect(listActiveUserIds).toHaveBeenLastCalledWith({ afterUserId: users[1], limit: 2 });
  });

  it("uses the bounded default page size for a short account list", async () => {
    const user = userIdSchema.parse("10000000-0000-4000-8000-000000000010");
    const listActiveUserIds = jest.fn().mockResolvedValue([user]);
    const system = createSystemContext({
      actorKind: "system",
      actorId: "00000000-0000-4000-8000-000000000004",
      requestId: "10000000-0000-4000-8000-000000000011",
    });

    await expect(
      forEachActiveTenant(
        system,
        {
          getControlPlaneRepositories: jest.fn().mockResolvedValue({
            accounts: { listActiveUserIds },
          }),
          getTenantRepositories: jest.fn().mockResolvedValue({}),
        } as never,
        jest.fn().mockResolvedValue(false)
      )
    ).resolves.toEqual({ visited: 1, enqueued: 0 });
    expect(listActiveUserIds).toHaveBeenCalledWith({ afterUserId: undefined, limit: 100 });
  });
});
