import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CAPTURE_TOKEN_PREFIX } from "@/lib/auth/constants";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type {
  CaptureTokenKind,
  CaptureTokenRecord,
  CaptureTokenRepository,
} from "@/lib/repositories/ports";

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

export interface IssueOptions {
  kind?: CaptureTokenKind;
  label?: string;
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

/** Prepare a secret and its hash-only record for an atomic repository operation. */
export function prepareCaptureToken(context: AuthContext, options: IssueOptions = {}) {
  const minted = mintToken(options);
  const kind = options.kind ?? "manual";
  const name =
    kind === "phone"
      ? "iPhone Shortcut"
      : kind === "browser"
        ? BROWSER_CONNECTION_NAME
        : CAPTURE_TOKEN_NAME;
  const label =
    kind === "phone"
      ? normalizeDeviceLabel(options.label, "iPhone")
      : kind === "browser"
        ? normalizeBrowserLabel(options.label)
        : options.label;
  const record: CaptureTokenRecord = {
    userId: context.userId,
    id: minted.id,
    name,
    tokenHash: minted.tokenHash,
    tokenPrefix: minted.tokenPrefix,
    kind,
    ...(label === undefined ? {} : { label }),
    createdAt: minted.createdAt,
  };
  return {
    record,
    issued: {
      id: minted.id,
      name,
      token: minted.token,
      tokenPrefix: minted.tokenPrefix,
      createdAt: minted.createdAt,
    } satisfies IssuedCaptureToken,
  };
}

/**
 * Manual issuance replaces only manual tokens. Device credentials are independent and revoke
 * nothing. The plaintext is returned exactly once and never passed to a repository.
 */
export async function issueCaptureToken(
  context: AuthContext,
  repository: CaptureTokenRepository,
  options: IssueOptions = {}
): Promise<IssuedCaptureToken> {
  const { record, issued } = prepareCaptureToken(context, options);
  if (record.kind === "manual") await repository.replaceActive(record);
  else await repository.create(record);
  return issued;
}

export interface IssuedBrowserConnection {
  connection: { id: string; label: string; createdAt: string };
  token: string;
}

/** Reduces a client-supplied label to short, single-line, printable text. */
function normalizeDeviceLabel(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value : "";
  const cleaned = Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? " " : char;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, BROWSER_CONNECTION_LABEL_MAX) || fallback;
}

export function normalizeBrowserLabel(value: unknown): string {
  return normalizeDeviceLabel(value, "Browser");
}

export function normalizePhoneLabel(value: unknown): string {
  return normalizeDeviceLabel(value, "iPhone");
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
