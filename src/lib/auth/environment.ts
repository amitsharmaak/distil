export interface AuthEnvironment {
  passwordHash: string;
  sessionSecret: string;
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
    allowedOrigins,
    legacyCaptureToken: env.DISTIL_API_TOKEN || undefined,
  });
}
