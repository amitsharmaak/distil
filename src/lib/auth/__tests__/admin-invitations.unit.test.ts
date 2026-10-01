import { readAdminUserIds } from "@/lib/auth/environment";
import type { InvitationSummary } from "@/lib/auth/ports";

import { isPlatformAdmin, maskEmail, toAdminInvitationView } from "../admin-invitations";

jest.mock("@/lib/auth/account-service", () => ({ resolveRequestAuthContext: jest.fn() }));
jest.mock("@/lib/database", () => ({
  getControlPlaneRepositories: jest.fn(),
  getTenantRepositories: jest.fn(),
}));

const adminId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

describe("admin allowlist", () => {
  it("parses comma-separated UUIDs, ignoring blanks, junk and case", () => {
    const ids = readAdminUserIds({
      DISTIL_ADMIN_USER_IDS: ` ${adminId.toUpperCase()}, not-a-uuid ,,${otherId}`,
    } as unknown as NodeJS.ProcessEnv);
    expect([...ids].sort()).toEqual([adminId, otherId]);
  });

  it("means nobody is an admin when the variable is unset or empty", () => {
    expect(readAdminUserIds({} as unknown as NodeJS.ProcessEnv).size).toBe(0);
    expect(
      readAdminUserIds({ DISTIL_ADMIN_USER_IDS: "" } as unknown as NodeJS.ProcessEnv).size
    ).toBe(0);
    expect(
      isPlatformAdmin(
        { userId: adminId as never, actorKind: "user" },
        {} as unknown as NodeJS.ProcessEnv
      )
    ).toBe(false);
  });

  it("recognises listed user sessions only", () => {
    const env = { DISTIL_ADMIN_USER_IDS: adminId } as unknown as NodeJS.ProcessEnv;
    expect(isPlatformAdmin({ userId: adminId as never, actorKind: "user" }, env)).toBe(true);
    expect(isPlatformAdmin({ userId: otherId as never, actorKind: "user" }, env)).toBe(false);
    // A capture token or system actor for an admin's account is never an admin session.
    expect(isPlatformAdmin({ userId: adminId as never, actorKind: "capture-token" }, env)).toBe(
      false
    );
    expect(isPlatformAdmin({ userId: adminId as never, actorKind: "system" }, env)).toBe(false);
  });
});

describe("invitation views", () => {
  const record: InvitationSummary = {
    id: "33333333-3333-4333-8333-333333333333",
    normalizedEmail: "colleague@example.com",
    status: "pending",
    issuedByActorId: adminId,
    issuanceReason: "settings:invited from Settings",
    createdAt: "2026-09-30T00:00:00.000Z",
    expiresAt: "2026-10-07T00:00:00.000Z",
  };

  it("masks everything but the first character and the domain", () => {
    expect(maskEmail("colleague@example.com")).toBe("c***@example.com");
    expect(maskEmail("nonsense")).toBe("***");
  });

  it("never exposes the full address, reason or actor ids", () => {
    const view = toAdminInvitationView(record, adminId, new Date("2026-10-01T00:00:00.000Z"));
    expect(view).toEqual({
      id: record.id,
      maskedEmail: "c***@example.com",
      status: "pending",
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      issuedByYou: true,
    });
    expect(JSON.stringify(view)).not.toContain("colleague");
  });

  it("reports a lapsed pending invitation as expired and flags other issuers", () => {
    const view = toAdminInvitationView(record, otherId, new Date("2026-10-08T00:00:00.000Z"));
    expect(view.status).toBe("expired");
    expect(view.issuedByYou).toBe(false);
  });

  it("keeps accepted and revoked states as recorded", () => {
    const now = new Date("2026-10-08T00:00:00.000Z");
    expect(
      toAdminInvitationView(
        { ...record, status: "accepted", consumedAt: "2026-10-01T00:00:00.000Z" },
        adminId,
        now
      )
    ).toMatchObject({ status: "accepted", acceptedAt: "2026-10-01T00:00:00.000Z" });
    expect(
      toAdminInvitationView(
        { ...record, status: "revoked", revokedAt: "2026-10-02T00:00:00.000Z" },
        adminId,
        now
      )
    ).toMatchObject({ status: "revoked", revokedAt: "2026-10-02T00:00:00.000Z" });
  });
});
