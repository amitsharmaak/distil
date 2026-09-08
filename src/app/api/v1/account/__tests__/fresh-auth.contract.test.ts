jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: () => ({ allowedOrigins: new Set(["https://distil.example"]) }),
}));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/lifecycle/route-auth", () => ({ requireLifecycleRoute: jest.fn() }));

import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";
import { LifecycleError } from "@/lib/lifecycle/errors";
import { POST as requestExport } from "@/app/api/v1/account/export/route";
import {
  DELETE as cancelDeletion,
  POST as requestDeletion,
} from "@/app/api/v1/account/deletion/route";

const staleError = () =>
  new LifecycleError(
    "FRESH_AUTH_REQUIRED",
    403,
    "Recent authentication is required for this account action",
    { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" }
  );

describe("account lifecycle fresh-auth route contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireLifecycleRoute).mockRejectedValue(staleError());
  });

  it.each([
    ["export", requestExport, "POST", "/api/v1/account/export"],
    ["deletion", requestDeletion, "POST", "/api/v1/account/deletion"],
    ["deletion cancellation", cancelDeletion, "DELETE", "/api/v1/account/deletion"],
  ])("returns the typed response for %s", async (_name, handler, method, path) => {
    const response = await handler(
      new Request(`https://distil.example${path}`, {
        method,
        headers: { origin: "https://distil.example", "content-type": "application/json" },
        ...(method === "POST" && path.endsWith("deletion")
          ? { body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }) }
          : {}),
      })
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
