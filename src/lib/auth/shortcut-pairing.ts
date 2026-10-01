import { randomBytes, randomUUID } from "node:crypto";
import {
  hashCaptureToken,
  normalizePhoneLabel,
  prepareCaptureToken,
} from "@/lib/auth/capture-tokens";
import { AuthError } from "@/lib/auth/errors";
import type { ShortcutPairingIdentityResolver } from "@/lib/auth/shortcut-pairing-identity";
import { createAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet, ShortcutPairingRepository } from "@/lib/repositories/ports";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SHORTCUT_PAIRING_VALIDITY_MS = 10 * 60 * 1000;

/** Normalize casing and the optional display separator without accepting ambiguous letters. */
export function normalizePairingCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim().toUpperCase();
  if (!/^[0-9A-HJKMNP-TV-Z]{4}-?[0-9A-HJKMNP-TV-Z]{4}$/.test(code)) return undefined;
  return code.replace("-", "");
}

function generateCode(bytes: Uint8Array): string {
  if (bytes.length !== 5) throw new Error("Pairing randomness must contain 40 bits");
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code = CROCKFORD_ALPHABET[Number(value & 31n)] + code;
    value >>= 5n;
  }
  return code;
}

export async function createPairingCode(
  context: AuthContext,
  repository: ShortcutPairingRepository,
  options: { now?: Date; id?: string; random?: Uint8Array } = {}
): Promise<{ code: string; expiresAt: string }> {
  const now = options.now ?? new Date();
  const code = generateCode(options.random ?? randomBytes(5));
  const expiresAt = new Date(now.getTime() + SHORTCUT_PAIRING_VALIDITY_MS).toISOString();
  await repository.replacePending({
    userId: context.userId,
    id: options.id ?? randomUUID(),
    codeHash: hashCaptureToken(code),
    createdAt: now.toISOString(),
    expiresAt,
    attempts: 0,
  });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

export interface ShortcutPairingDependencies {
  pairingIdentities: ShortcutPairingIdentityResolver;
  getTenantRepositories(
    context: AuthContext
  ): Pick<RepositorySet, "shortcutPairings"> | Promise<Pick<RepositorySet, "shortcutPairings">>;
}

function unauthorized(): never {
  throw new AuthError("UNAUTHORIZED", 401, "Authentication required");
}

/** Resolve only the exact hash, then authorize and consume inside one tenant transaction. */
export async function exchangePairingCode(
  input: { code?: unknown; deviceName?: unknown },
  dependencies: ShortcutPairingDependencies,
  options: { now?: Date; requestId?: string } = {}
): Promise<{ token: string }> {
  const code = normalizePairingCode(input.code);
  if (!code) unauthorized();
  const codeHash = hashCaptureToken(code);
  const identity = await dependencies.pairingIdentities.resolveByHash(codeHash);
  if (!identity) unauthorized();
  const context = createAuthContext({
    userId: identity.userId,
    actorKind: "system",
    actorId: identity.pairingId,
    requestId: options.requestId ?? randomUUID(),
  });
  const repositories = await dependencies.getTenantRepositories(context);
  const now = options.now ?? new Date();
  const { record, issued } = prepareCaptureToken(context, {
    now,
    kind: "phone",
    label: normalizePhoneLabel(input.deviceName),
  });
  const accepted = await repositories.shortcutPairings.exchange({
    id: identity.pairingId,
    codeHash,
    now: now.toISOString(),
    token: record,
  });
  if (!accepted) unauthorized();
  return { token: issued.token };
}
