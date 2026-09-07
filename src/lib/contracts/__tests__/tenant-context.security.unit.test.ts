import {
  createAuthContext,
  createSystemContext,
  parseAuthContext,
  parseSystemContext,
  type AuthContext,
  type AuthContextInput,
  type SystemContext,
} from "@/lib/contracts/tenant-context";

const USER_ID = "20000000-0000-4000-8000-000000000002";
const TOKEN_ID = "30000000-0000-4000-8000-000000000003";
const SYSTEM_ID = "40000000-0000-4000-8000-000000000004";
const REQUEST_ID = "50000000-0000-4000-8000-000000000005";
const SESSION_ID = "80000000-0000-4000-8000-000000000008";

type Expect<T extends true> = T;
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false;
type IsRequired<T, TKey extends keyof T> = T extends Required<Pick<T, TKey>> ? true : false;
type IsOptional<T, TKey extends keyof T> = T extends Required<Pick<T, TKey>> ? false : true;
type AuthKeysAreExact = Expect<
  Equal<keyof AuthContext, "userId" | "actorKind" | "actorId" | "sessionId" | "requestId">
>;
type AuthUserIdIsRequired = Expect<IsRequired<AuthContextInput, "userId">>;
type AuthActorKindIsRequired = Expect<IsRequired<AuthContextInput, "actorKind">>;
type AuthActorIdIsRequired = Expect<IsRequired<AuthContextInput, "actorId">>;
type AuthRequestIdIsRequired = Expect<IsRequired<AuthContextInput, "requestId">>;
type AuthSessionIdIsOptional = Expect<IsOptional<AuthContextInput, "sessionId">>;
type SystemKeysAreExact = Expect<Equal<keyof SystemContext, "actorKind" | "actorId" | "requestId">>;

const compileTimeContract: [
  AuthKeysAreExact,
  AuthUserIdIsRequired,
  AuthActorKindIsRequired,
  AuthActorIdIsRequired,
  AuthRequestIdIsRequired,
  AuthSessionIdIsOptional,
  SystemKeysAreExact,
] = [true, true, true, true, true, true, true];

describe("tenant context contracts", () => {
  it("locks required, optional, and excluded identity fields at compile time", () => {
    expect(compileTimeContract).toEqual([true, true, true, true, true, true, true]);
  });

  it.each([
    { actorKind: "user" as const, actorId: USER_ID, sessionId: SESSION_ID },
    { actorKind: "capture-token" as const, actorId: TOKEN_ID },
    { actorKind: "system" as const, actorId: SYSTEM_ID },
  ])("creates and freezes a user-scoped $actorKind context", (actor) => {
    const context = createAuthContext({
      userId: USER_ID,
      ...actor,
      requestId: REQUEST_ID,
    });

    expect(context).toEqual({ userId: USER_ID, ...actor, requestId: REQUEST_ID });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it.each(["userId", "actorKind", "actorId", "requestId"])(
    "rejects a context missing %s",
    (missingField) => {
      const incomplete: Record<string, unknown> = {
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
      "unknown tenantId",
      {
        userId: USER_ID,
        actorKind: "user",
        actorId: USER_ID,
        requestId: REQUEST_ID,
        tenantId: "10000000-0000-4000-8000-000000000001",
      },
    ],
    [
      "malformed user UUID",
      { userId: "user-1", actorKind: "capture-token", actorId: TOKEN_ID, requestId: REQUEST_ID },
    ],
    [
      "malformed actor UUID",
      { userId: USER_ID, actorKind: "capture-token", actorId: "token-1", requestId: REQUEST_ID },
    ],
    [
      "malformed session UUID",
      {
        userId: USER_ID,
        actorKind: "user",
        actorId: USER_ID,
        sessionId: "session-1",
        requestId: REQUEST_ID,
      },
    ],
    [
      "malformed request UUID",
      { userId: USER_ID, actorKind: "user", actorId: USER_ID, requestId: "request-1" },
    ],
    [
      "unsupported actor kind",
      { userId: USER_ID, actorKind: "admin", actorId: USER_ID, requestId: REQUEST_ID },
    ],
  ])("rejects %s", (_case, forgedContext) => {
    expect(() => parseAuthContext(forgedContext)).toThrow();
  });

  it("rejects a forged user context whose actor does not match the user", () => {
    expect(() =>
      parseAuthContext({
        userId: USER_ID,
        actorKind: "user",
        actorId: TOKEN_ID,
        requestId: REQUEST_ID,
      })
    ).toThrow("A user actorId must match userId");
  });

  it("keeps control-plane context structurally distinct and user-free", () => {
    const system = createSystemContext({
      actorKind: "system",
      actorId: SYSTEM_ID,
      requestId: REQUEST_ID,
    });

    expect(system).toEqual({ actorKind: "system", actorId: SYSTEM_ID, requestId: REQUEST_ID });
    expect(Object.isFrozen(system)).toBe(true);
    expect(() => parseAuthContext(system)).toThrow();
    expect(() => parseSystemContext({ ...system, userId: USER_ID })).toThrow();
  });
});
