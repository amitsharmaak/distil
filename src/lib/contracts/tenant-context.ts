import { z } from "zod";

/** Stable identifiers crossing a trust boundary are UUIDs, not display names. */
export const tenantIdSchema = z.string().uuid().brand<"TenantId">();
export const userIdSchema = z.string().uuid().brand<"UserId">();
export const actorIdSchema = z.string().uuid().brand<"ActorId">();
export const requestIdSchema = z.string().uuid().brand<"RequestId">();

export type TenantId = z.infer<typeof tenantIdSchema>;
export type UserId = z.infer<typeof userIdSchema>;
export type ActorId = z.infer<typeof actorIdSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;

export const AUTH_ACTOR_KINDS = ["user", "capture-token", "system"] as const;

export type AuthActorKind = (typeof AUTH_ACTOR_KINDS)[number];

/**
 * Tenant-scoped authorization propagated from an authenticated boundary.
 * A system actor here is acting on behalf of the named tenant and user.
 */
export const authContextSchema = z
  .object({
    tenantId: tenantIdSchema,
    userId: userIdSchema,
    actorKind: z.enum(AUTH_ACTOR_KINDS),
    actorId: actorIdSchema,
    requestId: requestIdSchema,
  })
  .strict()
  .superRefine((context, issueContext) => {
    if (context.actorKind === "user" && String(context.actorId) !== String(context.userId)) {
      issueContext.addIssue({
        code: "custom",
        path: ["actorId"],
        message: "A user actorId must match userId",
      });
    }
  })
  .readonly();

export type AuthContext = z.infer<typeof authContextSchema>;
export type AuthContextInput = z.input<typeof authContextSchema>;

/**
 * Control-plane identity. It intentionally cannot authorize tenant data access.
 */
export const systemContextSchema = z
  .object({
    actorKind: z.literal("system"),
    actorId: actorIdSchema,
    requestId: requestIdSchema,
  })
  .strict()
  .readonly();

export type SystemContext = z.infer<typeof systemContextSchema>;
export type SystemContextInput = z.input<typeof systemContextSchema>;

export function parseAuthContext(value: unknown): AuthContext {
  return authContextSchema.parse(value);
}

export function createAuthContext(input: AuthContextInput): AuthContext {
  return parseAuthContext(input);
}

export function parseSystemContext(value: unknown): SystemContext {
  return systemContextSchema.parse(value);
}

export function createSystemContext(input: SystemContextInput): SystemContext {
  return parseSystemContext(input);
}
