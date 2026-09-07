import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";

describe("readNeonAuthFoundation", () => {
  it("is disabled by default and does not require provider configuration", () => {
    expect(readNeonAuthFoundation({})).toEqual({
      enabled: false,
      status: "disabled",
      missing: [],
    });
  });

  it.each([" true", "true ", "TRUE", "1"])(
    "remains disabled unless FEATURE_NEON_AUTH is exactly true (%s)",
    (value) => {
      expect(readNeonAuthFoundation({ FEATURE_NEON_AUTH: value })).toEqual({
        enabled: false,
        status: "disabled",
        missing: [],
      });
    }
  );

  it("reports the enablement contract without exposing its values", () => {
    const foundation = readNeonAuthFoundation({
      FEATURE_NEON_AUTH: "true",
      NEON_AUTH_BASE_URL: "https://auth.example.test",
      NEON_AUTH_COOKIE_SECRET: "a-secret-that-must-not-be-returned",
    });

    expect(foundation).toEqual({ enabled: true, status: "ready", missing: [] });
    expect(JSON.stringify(foundation)).not.toContain("a-secret-that-must-not-be-returned");
  });

  it("fails closed when enabled without all server-side configuration", () => {
    expect(readNeonAuthFoundation({ FEATURE_NEON_AUTH: "true" })).toEqual({
      enabled: true,
      status: "misconfigured",
      missing: ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"],
    });
  });
});
