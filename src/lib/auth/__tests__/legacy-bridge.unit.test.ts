import { legacyAuthBridgeAvailable } from "@/lib/auth/legacy-bridge";

describe("legacy authentication migration bridge", () => {
  it("is available only while Neon Auth is feature-off", () => {
    expect(legacyAuthBridgeAvailable({})).toBe(true);
    expect(legacyAuthBridgeAvailable({ FEATURE_NEON_AUTH: "false" })).toBe(true);
    expect(legacyAuthBridgeAvailable({ FEATURE_NEON_AUTH: "true" })).toBe(false);
    expect(legacyAuthBridgeAvailable({ FEATURE_NEON_AUTH: "true", NEON_AUTH_BASE_URL: "" })).toBe(
      false
    );
  });
});
