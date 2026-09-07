import { readApplicationOrigin } from "@/lib/auth/app-origin";

describe("server-owned application origin", () => {
  it("uses only configured deployment state and requires HTTPS in production", () => {
    expect(
      readApplicationOrigin({
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "https://preview.distil.example/path",
      })
    ).toBe("https://preview.distil.example");
    expect(() =>
      readApplicationOrigin({
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "http://preview.distil.example",
      })
    ).toThrow("HTTPS");
    expect(() => readApplicationOrigin({ NODE_ENV: "production" })).toThrow("not configured");
  });

  it("permits the exact local development origin but no other insecure origin", () => {
    expect(
      readApplicationOrigin({
        NODE_ENV: "development",
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000/save",
      })
    ).toBe("http://localhost:3000");
    expect(() =>
      readApplicationOrigin({
        NODE_ENV: "development",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:3000",
      })
    ).toThrow("HTTPS");
  });
});
