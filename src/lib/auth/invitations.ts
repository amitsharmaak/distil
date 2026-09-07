import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccessDeniedError, type LinkedAccount, type ProviderIdentity } from "@/lib/auth/account";
import type { AuthRepositoryPort, InvitationRecord } from "@/lib/auth/ports";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

const invitationIdSchema = z.string().uuid();
const operatorTextSchema = z.string().trim().min(1).max(500);

export const invitationCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("issue"),
    email: z.string().email(),
    issuedByActorId: z.string().uuid(),
    reason: operatorTextSchema,
    appOrigin: z.string().url(),
  }),
  z.object({
    action: z.literal("revoke"),
    invitationId: invitationIdSchema,
    revokedByActorId: z.string().uuid(),
    reason: operatorTextSchema,
  }),
]);

export type InvitationCommand = z.infer<typeof invitationCommandSchema>;

export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFKC").toLowerCase();
}

function hashToken(secret: string, salt: string): string {
  return createHash("sha256").update(salt, "utf8").update("\0", "utf8").update(secret, "utf8").digest("hex");
}

function hashEmail(email: string, salt: string): string {
  return createHash("sha256").update(salt, "utf8").update("\0", "utf8").update(normalizeEmail(email), "utf8").digest("hex");
}

function parseToken(token: string): { invitationId: string; secret: string } | undefined {
  const separator = token.indexOf(".");
  if (separator < 0) return undefined;
  const invitationId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!invitationIdSchema.safeParse(invitationId).success || !/^[A-Za-z0-9_-]{40,64}$/.test(secret)) {
    return undefined;
  }
  return { invitationId, secret };
}

function equalHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function issueInvitation(
  input: Extract<InvitationCommand, { action: "issue" }>,
  repositories: AuthRepositoryPort,
  now = new Date()
): Promise<{ invitationId: string; invitationUrl: string; expiresAt: string }> {
  const invitationId = randomUUID();
  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenSalt = randomBytes(16).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const record: InvitationRecord = {
    id: invitationId,
    normalizedEmail: normalizeEmail(input.email),
    emailHash: hashEmail(input.email, tokenSalt),
    tokenSalt,
    tokenHash: hashToken(secret, tokenSalt),
    status: "pending",
    issuedByActorId: input.issuedByActorId,
    issuanceReason: input.reason.trim(),
    createdAt: now.toISOString(),
    expiresAt,
  };
  await repositories.createInvitation(record);

  const url = new URL("/invite", input.appOrigin);
  url.searchParams.set("token", `${invitationId}.${secret}`);
  return { invitationId, invitationUrl: url.toString(), expiresAt };
}

export async function validateInvitation(
  token: string,
  email: string,
  repositories: AuthRepositoryPort,
  now = new Date()
): Promise<{ invitationId: string; tokenHash: string; emailHash: string }> {
  const parsed = parseToken(token);
  if (!parsed) throw new AccessDeniedError("unmapped");
  const invitation = await repositories.findInvitationById(parsed.invitationId);
  if (!invitation) throw new AccessDeniedError("unmapped");
  const candidateHash = hashToken(parsed.secret, invitation.tokenSalt);
  const unavailable =
    invitation.status !== "pending" ||
    invitation.revokedAt !== undefined ||
    invitation.consumedAt !== undefined ||
    new Date(invitation.expiresAt).getTime() <= now.getTime() ||
    !equalHash(hashEmail(email, invitation.tokenSalt), invitation.emailHash) ||
    !equalHash(candidateHash, invitation.tokenHash);
  if (unavailable) throw new AccessDeniedError("unmapped");
  return { invitationId: invitation.id, tokenHash: candidateHash, emailHash: invitation.emailHash };
}

export async function acceptInvitation(
  token: string,
  identity: ProviderIdentity,
  repositories: AuthRepositoryPort,
  now = new Date()
): Promise<LinkedAccount> {
  if (!identity.emailVerified) throw new AccessDeniedError("unverified");
  const validated = await validateInvitation(token, identity.email, repositories, now);
  const account = await repositories.consumeInvitationAndLinkIdentity({
    invitationId: validated.invitationId,
    tokenHash: validated.tokenHash,
    emailHash: validated.emailHash,
    provider: identity.provider,
    providerSubject: identity.subject,
    providerSessionId: identity.sessionId,
    consumedAt: now.toISOString(),
  });
  if (!account || account.status !== "active") throw new AccessDeniedError("unmapped");
  return account;
}

export async function executeInvitationCommand(
  value: unknown,
  repositories: AuthRepositoryPort,
  now = new Date()
): Promise<{ invitationId: string; invitationUrl?: string; expiresAt?: string; revoked?: boolean }> {
  const command = invitationCommandSchema.parse(value);
  if (command.action === "issue") return issueInvitation(command, repositories, now);
  const revoked = await repositories.revokeInvitation({
    invitationId: command.invitationId,
    revokedAt: now.toISOString(),
    revokedByActorId: command.revokedByActorId,
    reason: command.reason.trim(),
  });
  return { invitationId: command.invitationId, revoked };
}
