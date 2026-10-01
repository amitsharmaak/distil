import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CAPTURE_TOKEN_PREFIX } from "@/lib/auth/constants";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureTokenRepository } from "@/lib/repositories/ports";

export interface IssuedCaptureToken {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  createdAt: string;
}

export function hashCaptureToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/** Display name stored for the account's manual capture token. */
export const CAPTURE_TOKEN_NAME = "Capture token";

/** Display name stored for every browser connection; the label tells them apart. */
export const BROWSER_CONNECTION_NAME = "Browser connection";

/** Labels are user-agent derived text; keep them short and single-line. */
export const BROWSER_CONNECTION_LABEL_MAX = 80;

interface IssueOptions {
  now?: Date;
  id?: string;
  random?: Uint8Array;
}

function mintToken(options: IssueOptions) {
  const token = `${CAPTURE_TOKEN_PREFIX}${Buffer.from(options.random ?? randomBytes(32)).toString("base64url")}`;
  return {
    token,
    id: options.id ?? randomUUID(),
    createdAt: (options.now ?? new Date()).toISOString(),
    tokenHash: hashCaptureToken(token),
    tokenPrefix: token.slice(0, CAPTURE_TOKEN_PREFIX.length + 8),
  };
}

/**
 * Issues the account's manual capture token (iPhone Shortcut, scripts), revoking every manual
 * token issued before it, including legacy per-client tokens. Browser connections are untouched.
 * The plaintext is returned exactly once.
 */
export async function issueCaptureToken(
  context: AuthContext,
  repository: CaptureTokenRepository,
  options: IssueOptions = {}
): Promise<IssuedCaptureToken> {
  const minted = mintToken(options);
  await repository.replaceActive({
    userId: context.userId,
    id: minted.id,
    name: CAPTURE_TOKEN_NAME,
    tokenHash: minted.tokenHash,
    tokenPrefix: minted.tokenPrefix,
    kind: "manual",
    createdAt: minted.createdAt,
  });
  return {
    id: minted.id,
    name: CAPTURE_TOKEN_NAME,
    token: minted.token,
    tokenPrefix: minted.tokenPrefix,
    createdAt: minted.createdAt,
  };
}

export interface IssuedBrowserConnection {
  connection: { id: string; label: string; createdAt: string };
  token: string;
}

/** Reduces a client-supplied label to short, single-line, printable text. */
export function normalizeBrowserLabel(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const cleaned = Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? " " : char;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, BROWSER_CONNECTION_LABEL_MAX) || "Browser";
}

/**
 * Issues one token for one browser. It revokes nothing: each browser holds its own token, so
 * disconnecting one leaves the others working. The plaintext is returned exactly once.
 */
export async function issueBrowserConnection(
  context: AuthContext,
  repository: CaptureTokenRepository,
  input: { label?: unknown },
  options: IssueOptions = {}
): Promise<IssuedBrowserConnection> {
  const minted = mintToken(options);
  const label = normalizeBrowserLabel(input.label);
  await repository.create({
    userId: context.userId,
    id: minted.id,
    name: BROWSER_CONNECTION_NAME,
    tokenHash: minted.tokenHash,
    tokenPrefix: minted.tokenPrefix,
    kind: "browser",
    label,
    createdAt: minted.createdAt,
  });
  return {
    connection: { id: minted.id, label, createdAt: minted.createdAt },
    token: minted.token,
  };
}

export function safeTokenEqual(left: string, right: string): boolean {
  const leftHash = Buffer.from(hashCaptureToken(left));
  const rightHash = Buffer.from(hashCaptureToken(right));
  return timingSafeEqual(leftHash, rightHash);
}
