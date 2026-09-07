/**
 * Phase 3 Neon Auth rollout boundary.
 *
 * This module intentionally has no SDK import and is not consumed by the
 * request path. It makes the future environment contract testable while the
 * existing single-user session implementation remains the only runtime auth.
 */
export type NeonAuthFoundationStatus = "disabled" | "misconfigured" | "ready";

export interface NeonAuthFoundation {
  enabled: boolean;
  status: NeonAuthFoundationStatus;
  missing: readonly string[];
}

const REQUIRED_VARIABLES = ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"] as const;

function enabled(value: string | undefined): boolean {
  return value === "true";
}

/**
 * Reports rollout readiness without returning configuration values. In
 * particular, callers can never accidentally log the cookie-signing secret.
 */
export function readNeonAuthFoundation(
  environment: Readonly<Record<string, string | undefined>> = process.env
): NeonAuthFoundation {
  const isEnabled = enabled(environment.FEATURE_NEON_AUTH);
  if (!isEnabled) {
    return Object.freeze({ enabled: false, status: "disabled", missing: Object.freeze([]) });
  }

  const missing = REQUIRED_VARIABLES.filter((name) => !environment[name]?.trim());
  if (
    environment.NEON_AUTH_COOKIE_SECRET &&
    environment.NEON_AUTH_COOKIE_SECRET.length < 32 &&
    !missing.includes("NEON_AUTH_COOKIE_SECRET")
  ) {
    missing.push("NEON_AUTH_COOKIE_SECRET");
  }
  return Object.freeze({
    enabled: true,
    status: missing.length === 0 ? "ready" : "misconfigured",
    missing: Object.freeze(missing),
  });
}
