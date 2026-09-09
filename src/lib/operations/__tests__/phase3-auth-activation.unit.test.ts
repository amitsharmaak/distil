import { phase3AuthActivationFindings } from "../phase3-auth-activation";

const validEnvironment = {
  FEATURE_NEON_AUTH: "true",
  FEATURE_CONNECTORS: "false",
  FEATURE_KNOWLEDGE_UI: "false",
  FEATURE_SEARCH: "false",
  FEATURE_ANSWERS: "false",
  FEATURE_PERSONALIZATION: "false",
  FEATURE_DIGESTS: "false",
  VERCEL_ENV: "preview",
  DATABASE_URL: "postgres://runtime",
  DATABASE_MIGRATION_URL: "postgres://migration",
  NEON_AUTH_BASE_URL: "https://auth-preview.example.test/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "a-secret-value-that-is-at-least-thirty-two-characters",
  NEXT_PUBLIC_API_BASE_URL: "https://phase3-auth.example.test",
  DISTIL_ALLOWED_ORIGINS: "https://phase3-auth.example.test",
  DISTIL_PHASE3_REHEARSAL_ORIGIN: "https://phase3-auth.example.test",
  DISTIL_PHASE3_REHEARSAL_SHA: "abc123",
  VERCEL_GIT_COMMIT_SHA: "abc123",
};

describe("Phase 3 auth activation preflight", () => {
  it("accepts one explicitly bound, synthetic Preview rehearsal", () => {
    expect(phase3AuthActivationFindings(validEnvironment)).toEqual([]);
  });

  it("accepts an explicitly SHA-bound clean-start Production release with product flags enabled", () => {
    expect(
      phase3AuthActivationFindings({
        ...validEnvironment,
        VERCEL_ENV: "production",
        FEATURE_KNOWLEDGE_UI: "true",
        FEATURE_SEARCH: "true",
        FEATURE_ANSWERS: "true",
        FEATURE_PERSONALIZATION: "true",
        FEATURE_DIGESTS: "true",
        DISTIL_PHASE3_REHEARSAL_ORIGIN: undefined,
        DISTIL_PHASE3_REHEARSAL_SHA: undefined,
        DISTIL_PHASE3_PRODUCTION_ORIGIN: "https://distil.example.test",
        DISTIL_PHASE3_PRODUCTION_SHA: "abc123",
        NEXT_PUBLIC_API_BASE_URL: "https://distil.example.test",
        DISTIL_ALLOWED_ORIGINS: "https://distil.example.test",
      })
    ).toEqual([]);
  });

  it("fails closed when activation is not isolated", () => {
    const findings = phase3AuthActivationFindings({
      ...validEnvironment,
      FEATURE_NEON_AUTH: "TRUE",
      FEATURE_CONNECTORS: "true",
      FEATURE_SEARCH: "true",
      DISTIL_LEGACY_USER_ID: "15baec07-275a-4ca8-be30-654db41155cf",
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "auth-flag" }),
        expect.objectContaining({ id: "synthetic-only" }),
      ])
    );
    expect(findings.filter(({ id }) => id === "rollout-posture")).toHaveLength(2);
  });

  it("rejects missing, weak, unsafe, or inconsistently bound configuration", () => {
    const findings = phase3AuthActivationFindings({
      ...validEnvironment,
      DATABASE_MIGRATION_URL: validEnvironment.DATABASE_URL,
      NEON_AUTH_BASE_URL: "http://auth-preview.example.test/neondb/auth",
      NEON_AUTH_COOKIE_SECRET: "short",
      DISTIL_ALLOWED_ORIGINS: "https://other.example.test,https://*.vercel.app",
      DISTIL_PHASE3_REHEARSAL_ORIGIN: "https://different.example.test",
      DISTIL_PHASE3_REHEARSAL_SHA: "approved",
      VERCEL_GIT_COMMIT_SHA: "deployed",
    });

    expect(new Set(findings.map(({ id }) => id))).toEqual(
      new Set([
        "allowed-origins",
        "auth-origin",
        "cookie-secret",
        "database-role-separation",
        "origin-binding",
        "sha-binding",
      ])
    );
  });

  it("requires exact application origins and the Neon database-auth endpoint path", () => {
    const findings = phase3AuthActivationFindings({
      ...validEnvironment,
      NEON_AUTH_BASE_URL: "https://auth-preview.example.test/not-auth",
      NEXT_PUBLIC_API_BASE_URL: "https://phase3-auth.example.test/path",
      DISTIL_PHASE3_REHEARSAL_ORIGIN: "https://phase3-auth.example.test?candidate=1",
    });

    expect(new Set(findings.map(({ id }) => id))).toEqual(
      new Set(["application-origin", "approved-origin", "auth-origin"])
    );
  });

  it("reports required variable names without returning any values", () => {
    const findings = phase3AuthActivationFindings({
      FEATURE_NEON_AUTH: "true",
      FEATURE_CONNECTORS: "false",
      FEATURE_KNOWLEDGE_UI: "false",
      FEATURE_SEARCH: "false",
      FEATURE_ANSWERS: "false",
      FEATURE_PERSONALIZATION: "false",
      FEATURE_DIGESTS: "false",
      VERCEL_ENV: "preview",
    });

    expect(findings.filter(({ id }) => id === "missing-variable")).toHaveLength(9);
    expect(JSON.stringify(findings)).not.toContain("postgres://");
  });

  it("rejects an auth service hosted on the application origin", () => {
    const findings = phase3AuthActivationFindings({
      ...validEnvironment,
      NEON_AUTH_BASE_URL: `${validEnvironment.NEXT_PUBLIC_API_BASE_URL}/neondb/auth`,
    });

    expect(findings).toEqual([expect.objectContaining({ id: "auth-origin-binding" })]);
  });
});
