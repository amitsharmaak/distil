import {
  createAuthContext,
  createSystemContext,
  parseAuthContext,
  parseSystemContext,
  type AuthContextInput,
  type SystemContext,
} from "@/lib/contracts/tenant-context";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const TOKEN_ID = "30000000-0000-4000-8000-000000000003";
const SYSTEM_ID = "40000000-0000-4000-8000-000000000004";
const REQUEST_ID = "50000000-0000-4000-8000-000000000005";

type Expect<T extends true> = T;
type IsRequired<T, TKey extends keyof T> = T extends Required<Pick<T, TKey>> ? true : false;
type AuthTenantIdIsRequired = Expect<IsRequired<AuthContextInput, "tenantId">>;
type AuthUserIdIsRequired = Expect<IsRequired<AuthContextInput, "userId">>;
type AuthActorKindIsRequired = Expect<IsRequired<AuthContextInput, "actorKind">>;
type AuthActorIdIsRequired = Expect<IsRequired<AuthContextInput, "actorId">>;
type AuthRequestIdIsRequired = Expect<IsRequired<AuthContextInput, "requestId">>;
type SystemContextIsTenantFree = Expect<"tenantId" extends keyof SystemContext ? false : true>;

const compileTimeContract: [
  AuthTenantIdIsRequired,
  AuthUserIdIsRequired,
  AuthActorKindIsRequired,
  AuthActorIdIsRequired,
  AuthRequestIdIsRequired,
  SystemContextIsTenantFree,
] = [true, true, true, true, true, true];

describe("tenant context contracts", () => {
  it("requires tenant identity at compile time and excludes it from SystemContext", () => {
    expect(compileTimeContract).toEqual([true, true, true, true, true, true]);
  });

  it.each([
    { actorKind: "user" as const, actorId: USER_ID },
    { actorKind: "capture-token" as const, actorId: TOKEN_ID },
    { actorKind: "system" as const, actorId: SYSTEM_ID },
  ])("creates and freezes a tenant-scoped $actorKind context", ({ actorKind, actorId }) => {
    const context = createAuthContext({
      tenantId: TENANT_ID,
      userId: USER_ID,
      actorKind,
      actorId,
      requestId: REQUEST_ID,
    });

    expect(context).toEqual({
      tenantId: TENANT_ID,
      userId: USER_ID,
      actorKind,
      actorId,
      requestId: REQUEST_ID,
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it.each(["tenantId", "userId", "actorKind", "actorId", "requestId"])(
    "rejects a context missing %s",
    (missingField) => {
      const incomplete: Record<string, unknown> = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        actorKind: "user",
        actorId: USER_ID,
        requestId: REQUEST_ID,
      };
      delete incomplete[missingField];

      expect(() => parseAuthContext(incomplete)).toThrow();
    }
  );

  it.each([
    [
      "unknown fields",
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        actorKind: "user",
        actorId: USER_ID,
        requestId: REQUEST_ID,
        elevated: true,
      },
    ],
    [
      "a malformed user UUID",
      {
        tenantId: TENANT_ID,
        userId: "user-1",
        actorKind: "capture-token",
        actorId: TOKEN_ID,
        requestId: REQUEST_ID,
      },
    ],
    [
      "a malformed actor UUID",
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        actorKind: "capture-token",
        actorId: "token-1",
        requestId: REQUEST_ID,
      },
    ],
    [
      "a malformed tenant UUID",
      {
        tenantId: "tenant-1",
        userId: USER_ID,
        actorKind: "user",
        actorId: USER_ID,
        requestId: REQUEST_ID,
      },
    ],
    [
      "a malformed request UUID",
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        actorKind: "user",
        actorId: USER_ID,
        requestId: "request-1",
      },
    ],
    [
      "an unsupported actor kind",
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        actorKind: "admin",
        actorId: USER_ID,
        requestId: REQUEST_ID,
      },
    ],
  ])("rejects %s", (_case, forgedContext) => {
    expect(() => parseAuthContext(forgedContext)).toThrow();
  });

  it("rejects a forged user context whose actor does not match the user", () => {
    expect(() =>
      parseAuthContext({
        tenantId: TENANT_ID,
        userId: USER_ID,
        actorKind: "user",
        actorId: TOKEN_ID,
        requestId: REQUEST_ID,
      })
    ).toThrow("A user actorId must match userId");
  });

  it("keeps control-plane context structurally distinct and tenant-free", () => {
    const system = createSystemContext({
      actorKind: "system",
      actorId: SYSTEM_ID,
      requestId: REQUEST_ID,
    });

    expect(system).toEqual({
      actorKind: "system",
      actorId: SYSTEM_ID,
      requestId: REQUEST_ID,
    });
    expect(Object.isFrozen(system)).toBe(true);
    expect(() => parseAuthContext(system)).toThrow();
    expect(() => parseSystemContext({ ...system, tenantId: TENANT_ID })).toThrow();
  });
});
