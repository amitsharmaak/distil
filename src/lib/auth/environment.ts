export interface AuthEnvironment {
  passwordHash: string;
  sessionSecret: string;
  /**
   * Secret behind the proxy-to-route identity token: the Neon Auth cookie
   * secret when hosted auth is configured, else the legacy session secret.
   */
  identityTokenSecret: string;
  allowedOrigins: ReadonlySet<string>;
  legacyCaptureToken?: string;
}

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function readAuthEnvironment(env: NodeJS.ProcessEnv = process.env): AuthEnvironment {
  const allowedOrigins = new Set(
    (env.DISTIL_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(normalizeOrigin)
      .filter((value): value is string => Boolean(value))
  );

  const publicOrigin = normalizeOrigin(env.NEXT_PUBLIC_API_BASE_URL ?? "");
  if (publicOrigin) allowedOrigins.add(publicOrigin);
  if (env.NODE_ENV !== "production") allowedOrigins.add("http://localhost:3000");

  return Object.freeze({
    passwordHash: env.DISTIL_WEB_PASSWORD_HASH ?? "",
    sessionSecret: env.DISTIL_SESSION_SECRET ?? "",
    identityTokenSecret: env.NEON_AUTH_COOKIE_SECRET || env.DISTIL_SESSION_SECRET || "",
    allowedOrigins,
    legacyCaptureToken: env.DISTIL_API_TOKEN || undefined,
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * User ids allowed to administer invitations, from DISTIL_ADMIN_USER_IDS
 * (comma-separated UUIDs). Anything that is not a UUID is ignored, so a typo
 * can never widen access; an unset variable means nobody is an admin.
 */
export function readAdminUserIds(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  return new Set(
    (env.DISTIL_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value))
  );
}
