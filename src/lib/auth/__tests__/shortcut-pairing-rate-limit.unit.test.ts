import { createHash } from "node:crypto";
import type { Sql } from "postgres";

import { enforceShortcutPairingRateLimit } from "@/lib/auth/shortcut-pairing-rate-limit";

describe("anonymous shortcut pairing rate limit", () => {
  it("persists only the digest of the namespaced client IP through the bounded capability", async () => {
    const sql = jest.fn().mockResolvedValue([{ allowed: true }]);
    const request = new Request("https://distil.example/api/v1/shortcut-pairings/exchange", {
      headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
    });

    await expect(
      enforceShortcutPairingRateLimit(request, sql as unknown as Sql)
    ).resolves.toBeUndefined();

    const [statement, ...values] = sql.mock.calls[0];
    expect(statement.join("?")).toContain("public.distil_consume_shortcut_pairing_rate_limit(?)");
    expect(values).toEqual([createHash("sha256").update("pairing:203.0.113.4").digest("hex")]);
    expect(JSON.stringify(sql.mock.calls)).not.toContain("203.0.113.4");
  });

  it("shares an unknown-client bucket when no forwarding metadata exists", async () => {
    const sql = jest.fn().mockResolvedValue([{ allowed: true }]);
    await enforceShortcutPairingRateLimit(
      new Request("https://distil.example"),
      sql as unknown as Sql
    );
    expect(sql.mock.calls[0][1]).toBe(createHash("sha256").update("pairing:unknown").digest("hex"));
  });

  it("rejects exhausted windows without relying on a tenant or browser session", async () => {
    const sql = jest.fn().mockResolvedValue([{ allowed: false }]);
    await expect(
      enforceShortcutPairingRateLimit(
        new Request("https://distil.example", { headers: { cookie: "session=present" } }),
        sql as unknown as Sql
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it.each([{ rows: [] }, { rows: [{ allowed: null }] }])(
    "fails closed when the limiter returns unusable state",
    async ({ rows }) => {
      const sql = jest.fn().mockResolvedValue(rows);
      await expect(
        enforceShortcutPairingRateLimit(
          new Request("https://distil.example"),
          sql as unknown as Sql
        )
      ).rejects.toThrow("Pairing rate limit unavailable");
    }
  );

  it("propagates database failures so callers cannot exchange without a durable limit", async () => {
    const sql = jest.fn().mockRejectedValue(new Error("storage unavailable"));
    await expect(
      enforceShortcutPairingRateLimit(new Request("https://distil.example"), sql as unknown as Sql)
    ).rejects.toThrow("storage unavailable");
  });
});
