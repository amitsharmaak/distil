import { NeonAuthAccountPurger } from "@/lib/lifecycle/neon-auth-account-purger";
import { authProviderSubjectSchema } from "@/lib/lifecycle/ports";

const providerSubject = authProviderSubjectSchema.parse("neon:external-subject-123");

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

    await Promise.all([
      purger.revokeSessions(providerSubject),
      purger.deleteIdentity(providerSubject),
    ]);
    await purger.deleteIdentity(providerSubject);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "https://console.neon.test/api/v2/projects/project-one/branches/branch-one/auth/users/neon%3Aexternal-subject-123",
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
    await expect(purger.revokeSessions(providerSubject)).resolves.toBeUndefined();

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
    await expect(failed.deleteIdentity(providerSubject)).rejects.toThrow(
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
