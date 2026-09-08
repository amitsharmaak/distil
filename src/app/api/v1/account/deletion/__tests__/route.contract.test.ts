jest.mock("@/lib/auth/environment", () => ({
  readAuthEnvironment: jest.fn(() => ({ allowedOrigins: new Set(["https://distil.example"]) })),
}));
jest.mock("@/lib/auth/origin", () => ({ requireAllowedOrigin: jest.fn() }));
jest.mock("@/lib/lifecycle/route-auth", () => ({ requireLifecycleRoute: jest.fn() }));
jest.mock("@/lib/lifecycle/deletion", () => {
  const actual = jest.requireActual<typeof import("@/lib/lifecycle/deletion")>(
    "@/lib/lifecycle/deletion"
  );
  return {
    ...actual,
    requestAccountDeletion: jest.fn(),
    cancelAccountDeletion: jest.fn(),
  };
});

import { requireAllowedOrigin } from "@/lib/auth/origin";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/lifecycle/deletion";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

import { DELETE, GET, POST } from "../route";

const deletion = {
  id: "44444444-4444-4444-8444-444444444444",
  userId: "11111111-1111-4111-8111-111111111111",
  status: "requested",
  checkpoint: { private: "not-public" },
  requestedAt: "2026-09-08T00:00:00.000Z",
  purgeAfter: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};
const context = { userId: deletion.userId, actorId: deletion.userId };
const repositories = { lifecycle: { findDeletion: jest.fn() } };

beforeEach(() => {
  jest.clearAllMocks();
  repositories.lifecycle.findDeletion.mockResolvedValue(deletion);
  jest.mocked(requireLifecycleRoute).mockResolvedValue({
    context,
    account: { userId: deletion.userId, status: "deletion_pending" },
    repositories,
  } as never);
  jest.mocked(requestAccountDeletion).mockResolvedValue({
    deletion,
    jobId: deletion.id,
    created: true,
  } as never);
  jest.mocked(cancelAccountDeletion).mockResolvedValue({
    ...deletion,
    status: "cancelled",
  } as never);
});

describe("account deletion recovery route", () => {
  it("returns only owner status for active or deletion-pending identities without fresh auth", async () => {
    const response = await GET(new Request("https://distil.example/api/v1/account/deletion"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(requireLifecycleRoute).toHaveBeenCalledWith(expect.any(Request), {
      allowDeletionPending: true,
    });
    expect(requireAllowedOrigin).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload).toMatchObject({
      account: { status: "deletion_pending" },
      deletion: { id: deletion.id, status: "requested" },
    });
    expect(JSON.stringify(payload)).not.toContain(deletion.userId);
    expect(JSON.stringify(payload)).not.toContain("private");
  });

  it("preserves Origin and fresh-auth requirements for request and cancellation", async () => {
    const requested = await POST(
      new Request("https://distil.example/api/v1/account/deletion", {
        method: "POST",
        headers: { origin: "https://distil.example", "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
      })
    );
    expect(requested.status).toBe(202);
    expect(requireLifecycleRoute).toHaveBeenNthCalledWith(1, expect.any(Request), { fresh: true });

    const cancelled = await DELETE(
      new Request("https://distil.example/api/v1/account/deletion", {
        method: "DELETE",
        headers: { origin: "https://distil.example" },
      })
    );
    expect(cancelled.status).toBe(200);
    expect(requireLifecycleRoute).toHaveBeenNthCalledWith(2, expect.any(Request), {
      fresh: true,
      allowDeletionPending: true,
    });
    expect(requireAllowedOrigin).toHaveBeenCalledTimes(2);
  });
});
