export interface Phase3AuthActivationFinding {
  id: string;
  detail: string;
}

const DISABLED_DURING_AUTH_REHEARSAL = [
  "FEATURE_CONNECTORS",
  "FEATURE_KNOWLEDGE_UI",
  "FEATURE_SEARCH",
  "FEATURE_ANSWERS",
  "FEATURE_PERSONALIZATION",
  "FEATURE_DIGESTS",
] as const;

const REQUIRED_VARIABLES = [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "NEXT_PUBLIC_API_BASE_URL",
  "DISTIL_ALLOWED_ORIGINS",
  "DISTIL_PHASE3_REHEARSAL_ORIGIN",
  "DISTIL_PHASE3_REHEARSAL_SHA",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

function origin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.pathname === "/" && !parsed.search && !parsed.hash
      ? parsed.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates a synthetic, unpromoted Phase 3 hosted-auth rehearsal without ever
 * returning configuration values. This is intentionally stricter than normal
 * application configuration because the rehearsal should vary only auth.
 */
export function phase3AuthActivationFindings(
  environment: Readonly<Record<string, string | undefined>>
): Phase3AuthActivationFinding[] {
  const findings: Phase3AuthActivationFinding[] = [];
  const add = (id: string, detail: string) => findings.push({ id, detail });

  if (environment.FEATURE_NEON_AUTH !== "true") {
    add("auth-flag", "FEATURE_NEON_AUTH must be exactly true");
  }
  if (environment.VERCEL_ENV !== "preview") {
    add("preview-only", "VERCEL_ENV must be preview");
  }
  for (const name of DISABLED_DURING_AUTH_REHEARSAL) {
    if (environment[name] !== "false") add("rollout-posture", `${name} must be exactly false`);
  }
  for (const name of REQUIRED_VARIABLES) {
    if (!environment[name]?.trim()) add("missing-variable", `${name} is required`);
  }

  const applicationOrigin = origin(environment.NEXT_PUBLIC_API_BASE_URL);
  const rehearsalOrigin = origin(environment.DISTIL_PHASE3_REHEARSAL_ORIGIN);
  const authOrigin = origin(environment.NEON_AUTH_BASE_URL);
  if (environment.NEXT_PUBLIC_API_BASE_URL && !applicationOrigin) {
    add("application-origin", "NEXT_PUBLIC_API_BASE_URL must be an exact HTTPS origin");
  }
  if (environment.DISTIL_PHASE3_REHEARSAL_ORIGIN && !rehearsalOrigin) {
    add("rehearsal-origin", "DISTIL_PHASE3_REHEARSAL_ORIGIN must be an exact HTTPS origin");
  }
  if (environment.NEON_AUTH_BASE_URL && !authOrigin) {
    add("auth-origin", "NEON_AUTH_BASE_URL must be an exact HTTPS origin");
  }
  if (applicationOrigin && rehearsalOrigin && applicationOrigin !== rehearsalOrigin) {
    add("origin-binding", "application and rehearsal origins must match exactly");
  }
  if (applicationOrigin && authOrigin && applicationOrigin === authOrigin) {
    add("auth-origin-binding", "application and auth service origins must be distinct");
  }

  if (environment.NEON_AUTH_COOKIE_SECRET && environment.NEON_AUTH_COOKIE_SECRET.length < 32) {
    add("cookie-secret", "NEON_AUTH_COOKIE_SECRET must contain at least 32 characters");
  }

  if (
    environment.DATABASE_URL &&
    environment.DATABASE_MIGRATION_URL &&
    environment.DATABASE_URL === environment.DATABASE_MIGRATION_URL
  ) {
    add("database-role-separation", "runtime and migration database URLs must be distinct");
  }

  const allowedOrigins = (environment.DISTIL_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedOrigins.some((value) => value.includes("*"))) {
    add("allowed-origins", "DISTIL_ALLOWED_ORIGINS must not contain wildcards");
  }
  if (applicationOrigin && !allowedOrigins.includes(applicationOrigin)) {
    add("allowed-origins", "DISTIL_ALLOWED_ORIGINS must include the exact application origin");
  }

  if (
    environment.DISTIL_PHASE3_REHEARSAL_SHA &&
    environment.VERCEL_GIT_COMMIT_SHA &&
    environment.DISTIL_PHASE3_REHEARSAL_SHA !== environment.VERCEL_GIT_COMMIT_SHA
  ) {
    add("sha-binding", "rehearsal approval SHA must match the deployed Git SHA");
  }

  if (environment.DISTIL_LEGACY_USER_ID?.trim()) {
    add("synthetic-only", "DISTIL_LEGACY_USER_ID must be absent for the synthetic rehearsal");
  }

  return findings.sort((left, right) =>
    `${left.id}:${left.detail}`.localeCompare(`${right.id}:${right.detail}`)
  );
}
