import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";

import { AccessDeniedError } from "@/lib/auth/account";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { readApplicationOrigin } from "@/lib/auth/app-origin";
import { readAdminUserIds, readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { authFailureResponse } from "@/lib/auth/http";
import { executeInvitationCommand } from "@/lib/auth/invitations";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import type { InvitationSummary } from "@/lib/auth/ports";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { config } from "@/lib/config";
import {
  createSystemContext,
  userIdSchema,
  type AuthContext,
  type SystemContext,
} from "@/lib/contracts";
import { getControlPlaneRepositories, getTenantRepositories } from "@/lib/database";
import { apiLogger } from "@/lib/logger";
import type { ControlPlaneRepositorySet } from "@/lib/repositories/ports";

/** Fixed system identity for the control-plane client used by admin invitation routes. */
export const ADMIN_INVITATIONS_SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000006";
export const ADMIN_INVITE_DAILY_LIMIT = 20;
const LIST_LIMIT = 100;
const DEFAULT_NOTE = "invited from Settings";
const DEFAULT_REVOKE_REASON = "revoked from Settings";

const issueBodySchema = z
  .object({
    email: z.string().trim().max(254).email(),
    note: z.string().trim().max(200).optional(),
  })
  .strict();
const revokeBodySchema = z.object({ reason: z.string().trim().max(200).optional() }).strict();

export type AdminInvitationStatus = InvitationSummary["status"];

export interface AdminInvitationView {
  id: string;
  maskedEmail: string;
  status: AdminInvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  issuedByYou: boolean;
}

/** Session identities only: capture tokens and system actors are never admins. */
export function isPlatformAdmin(
  context: Pick<AuthContext, "userId" | "actorKind">,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    context.actorKind === "user" && readAdminUserIds(env).has(String(context.userId).toLowerCase())
  );
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function toAdminInvitationView(
  record: InvitationSummary,
  viewerId: string,
  now = new Date()
): AdminInvitationView {
  const expired =
    record.status === "pending" && new Date(record.expiresAt).getTime() <= now.getTime();
  return {
    id: record.id,
    maskedEmail: maskEmail(record.normalizedEmail),
    status: expired ? "expired" : record.status,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    ...(record.consumedAt ? { acceptedAt: record.consumedAt } : {}),
    ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    issuedByYou: record.issuedByActorId === String(viewerId),
  };
}

/** Resolves the session and rejects everyone outside the allowlist with 403. */
export async function requireAdmin(request: Request, mutating: boolean): Promise<AuthContext> {
  if (mutating) requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
  const context = await resolveRequestAuthContext(request);
  if (!isPlatformAdmin(context)) {
    throw new AuthError("FORBIDDEN", 403, "Administrator access required");
  }
  return context;
}

/**
 * The runtime database role cannot read or write `invitations` (migration 0007),
 * so admin invitation work runs on the separately privileged control-plane client.
 */
async function controlPlane(context: AuthContext): Promise<ControlPlaneRepositorySet> {
  if (!config.databaseControlPlaneUrl) {
    throw new AuthError(
      "SERVICE_UNAVAILABLE",
      503,
      "Invitations are unavailable: the control-plane database is not configured"
    );
  }
  const system: SystemContext = createSystemContext({
    actorKind: "system",
    actorId: ADMIN_INVITATIONS_SYSTEM_ACTOR_ID,
    requestId: context.requestId,
  });
  return getControlPlaneRepositories(system);
}

async function audit(
  control: ControlPlaneRepositorySet,
  context: AuthContext,
  input: {
    action: "invitation.issue" | "invitation.revoke";
    invitationId: string;
    reason: string;
    outcome: "succeeded" | "no-op";
  }
): Promise<void> {
  try {
    await control.lifecycle.audit({
      id: randomUUID(),
      actorId: String(context.userId),
      action: input.action,
      targetUserId: userIdSchema.parse(input.invitationId),
      reason: input.reason,
      requestId: context.requestId,
      outcome: input.outcome,
      at: new Date().toISOString(),
    });
  } catch {
    // The invitation row already records actor and reason; losing the audit row
    // must not hide a link that can never be shown again.
    apiLogger.warn(
      { event: "admin_invitation_audit_failed", action: input.action, actorId: context.userId },
      "audit write failed"
    );
  }
}

async function parseJson<T extends z.ZodTypeAny>(
  text: string,
  schema: T,
  message: string
): Promise<z.infer<T>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AuthError("INVALID_REQUEST", 400, "A JSON body is required");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AuthError("INVALID_REQUEST", 400, message);
  return parsed.data;
}

export async function listInvitationsForAdmin(request: Request): Promise<AdminInvitationView[]> {
  const context = await requireAdmin(request, false);
  const control = await controlPlane(context);
  const records = await control.auth.listInvitations(LIST_LIMIT);
  return records.map((record) => toAdminInvitationView(record, context.userId));
}

export async function issueInvitationForAdmin(request: Request) {
  const context = await requireAdmin(request, true);
  const body = await parseJson(
    await request.text(),
    issueBodySchema,
    "Enter a valid email address"
  );
  const control = await controlPlane(context);
  const repositories = await getTenantRepositories(context);
  await enforceRateLimit(repositories.rateLimits, {
    context,
    key: `admin-invite:${context.userId}`,
    operation: "admin-invite-issue",
    limit: ADMIN_INVITE_DAILY_LIMIT,
    windowSeconds: 24 * 60 * 60,
  });
  const reason = `settings:${body.note || DEFAULT_NOTE}`;
  const issued = await executeInvitationCommand(
    {
      action: "issue",
      email: body.email,
      issuedByActorId: String(context.userId),
      reason,
      appOrigin: readApplicationOrigin(),
    },
    control.auth
  );
  await audit(control, context, {
    action: "invitation.issue",
    invitationId: issued.invitationId,
    reason,
    outcome: "succeeded",
  });
  return {
    invitationId: issued.invitationId,
    invitationUrl: issued.invitationUrl as string,
    expiresAt: issued.expiresAt as string,
  };
}

export async function revokeInvitationForAdmin(
  request: Request,
  invitationId: string
): Promise<void> {
  const context = await requireAdmin(request, true);
  if (!z.string().uuid().safeParse(invitationId).success) {
    throw new AuthError("NOT_FOUND", 404, "Invitation not found");
  }
  const text = await request.text();
  const body = text ? await parseJson(text, revokeBodySchema, "Invalid revoke reason") : {};
  const control = await controlPlane(context);
  const reason = `settings:${body.reason || DEFAULT_REVOKE_REASON}`;
  const result = await executeInvitationCommand(
    { action: "revoke", invitationId, revokedByActorId: String(context.userId), reason },
    control.auth
  );
  await audit(control, context, {
    action: "invitation.revoke",
    invitationId,
    reason,
    outcome: result.revoked ? "succeeded" : "no-op",
  });
  // Missing, already accepted and already revoked all look the same to the caller.
  if (!result.revoked) throw new AuthError("NOT_FOUND", 404, "Invitation not found or not pending");
}

export function adminFailure(error: unknown): Response {
  if (error instanceof AccessDeniedError) return authFailureResponse(error);
  if (error instanceof ZodError) {
    return errorResponse(new AuthError("INVALID_REQUEST", 400, "Invalid request"));
  }
  return errorResponse(error);
}
