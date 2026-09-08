import { NeonAuthAccountPurger } from "@/lib/lifecycle/neon-auth-account-purger";
import { userIdSchema } from "@/lib/contracts";

const userId = userIdSchema.parse("11111111-1111-4111-8111-111111111111");

describe("Neon Auth account purger", () => {
  it("coalesces session and identity purge into the branch-scoped admin deletion", async () => {
    const request = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 })) as jest.MockedFunction<typeof fetch>;
    const purger = new NeonAuthAccountPurger({
      apiKey: "server-only-key",
      projectId: "project-one",
      branchId: "branch-one",
      apiBaseUrl: "https://console.neon.test/api/v2/",
      fetch: request,
    });

    await Promise.all([purger.revokeSessions(userId), purger.deleteIdentity(userId)]);
    await purger.deleteIdentity(userId);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      `https://console.neon.test/api/v2/projects/project-one/branches/branch-one/auth/users/${userId}`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ authorization: "Bearer server-only-key" }),
        redirect: "error",
      })
    );
  });

  it("treats already-removed users as success and sanitizes provider failures", async () => {
    const missing = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 })) as jest.MockedFunction<typeof fetch>;
    const purger = new NeonAuthAccountPurger({
      apiKey: "key",
      projectId: "project-one",
      branchId: "branch-one",
      fetch: missing,
    });
    await expect(purger.revokeSessions(userId)).resolves.toBeUndefined();

    const failed = new NeonAuthAccountPurger({
      apiKey: "key",
      projectId: "project-one",
      branchId: "branch-one",
      fetch: jest
        .fn()
        .mockResolvedValue(
          new Response("sensitive provider body", { status: 500 })
        ) as jest.MockedFunction<typeof fetch>,
    });
    await expect(failed.deleteIdentity(userId)).rejects.toThrow(
      "Neon identity purge failed with status 500"
    );
  });

  it("rejects incomplete or unsafe configuration before making a request", () => {
    expect(
      () =>
        new NeonAuthAccountPurger({
          apiKey: "key",
          projectId: "../other-project",
          branchId: "branch-one",
        })
    ).toThrow("Invalid Neon project ID");
    expect(
      () =>
        new NeonAuthAccountPurger({
          apiKey: "key",
          projectId: "project-one",
          branchId: "branch-one",
          apiBaseUrl: "http://console.neon.test/api/v2/",
        })
    ).toThrow("must use HTTPS");
  });
});
