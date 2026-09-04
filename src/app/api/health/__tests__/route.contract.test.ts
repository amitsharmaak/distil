import { dynamic, GET } from "../route";

describe("GET /api/health", () => {
  it("returns a stable non-secret liveness response", async () => {
    process.env.DATABASE_URL = "postgres://secret@database.example/distil";
    process.env.DISTIL_SESSION_SECRET = "do-not-expose";

    const response = await GET();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(serialized).toBe(JSON.stringify({ status: "ok", service: "distil" }));
    expect(serialized).not.toContain("secret");
    expect(dynamic).toBe("force-dynamic");

    delete process.env.DATABASE_URL;
    delete process.env.DISTIL_SESSION_SECRET;
  });
});
