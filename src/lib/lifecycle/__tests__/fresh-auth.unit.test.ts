import { lifecycleErrorResponse, LifecycleError } from "@/lib/lifecycle/errors";

describe("lifecycle fresh-auth contract", () => {
  it("returns a typed, non-redirecting recovery response", async () => {
    const response = lifecycleErrorResponse(
      new LifecycleError(
        "FRESH_AUTH_REQUIRED",
        403,
        "Recent authentication is required for this account action",
        { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" }
      )
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "FRESH_AUTH_REQUIRED",
        message: "Recent authentication is required for this account action",
        recovery: { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" },
      },
    });
  });
});
