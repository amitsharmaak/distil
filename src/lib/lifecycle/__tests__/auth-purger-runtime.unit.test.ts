jest.mock("@/lib/lifecycle/neon-auth-account-purger", () => ({
  NeonAuthAccountPurger: jest.fn().mockImplementation((options) => ({ options })),
}));

import { getLifecycleAuthPurger } from "@/lib/lifecycle/auth-purger-runtime";
import { NeonAuthAccountPurger } from "@/lib/lifecycle/neon-auth-account-purger";

describe("lifecycle auth-purger runtime", () => {
  it("fails closed unless the Neon provider is exactly selected and complete", () => {
    expect(() => getLifecycleAuthPurger({})).toThrow(
      expect.objectContaining({ code: "UNAVAILABLE", status: 503 })
    );
    expect(() => getLifecycleAuthPurger({ DISTIL_AUTH_PURGE_PROVIDER: "neon" })).toThrow(
      "misconfigured"
    );
    expect(NeonAuthAccountPurger).not.toHaveBeenCalled();
  });

  it("constructs and caches the configured provider-admin adapter", () => {
    const environment = {
      DISTIL_AUTH_PURGE_PROVIDER: "neon",
      NEON_API_KEY: "key",
      NEON_PROJECT_ID: "project-one",
      NEON_BRANCH_ID: "branch-one",
    };
    const first = getLifecycleAuthPurger(environment);
    const second = getLifecycleAuthPurger(environment);
    expect(first).toBe(second);
    expect(NeonAuthAccountPurger).toHaveBeenCalledWith({
      apiKey: "key",
      projectId: "project-one",
      branchId: "branch-one",
    });
  });
});
