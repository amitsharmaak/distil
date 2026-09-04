import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireAllowedOrigin } from "@/lib/auth/origin";

describe("origin enforcement", () => {
  it("allows exact configured origins and rejects hostile or missing origins", () => {
    const allowed = new Set(["https://distil.example"]);
    expect(() =>
      requireAllowedOrigin(
        new Request("https://distil.example", { headers: { origin: "https://distil.example" } }),
        allowed
      )
    ).not.toThrow();
    for (const origin of [undefined, "https://distil.example.evil.test", "null"]) {
      const headers = origin ? { origin } : undefined;
      expect(() =>
        requireAllowedOrigin(new Request("https://distil.example", { headers }), allowed)
      ).toThrow(expect.objectContaining({ code: "ORIGIN_NOT_ALLOWED", status: 403 }));
    }
  });

  it("normalizes configured origins and ignores invalid values", () => {
    const environment = readAuthEnvironment({
      NODE_ENV: "production",
      DISTIL_ALLOWED_ORIGINS: "https://distil.example/path,not-a-url",
      NEXT_PUBLIC_API_BASE_URL: "https://preview.distil.example/save",
    });
    expect([...environment.allowedOrigins]).toEqual([
      "https://distil.example",
      "https://preview.distil.example",
    ]);
  });
});
