import type { NeonQueryFunction } from "@neondatabase/serverless";

import { NeonHttpAuthRepository } from "@/lib/auth/neon-http-repository";
import { createRequestMetrics, runWithRequestMetrics } from "@/lib/observability/request-metrics";

const userId = "11111111-1111-4111-8111-111111111111";

function httpClient(rows: unknown[]) {
  const query = jest.fn().mockResolvedValue(rows);
  return {
    query,
    repository: new NeonHttpAuthRepository({ query } as unknown as Pick<
      NeonQueryFunction<false, false>,
      "query"
    >),
  };
}

describe("NeonHttpAuthRepository", () => {
  it("uses the existing exact-key security-definer function with bound parameters", async () => {
    const client = httpClient([
      { user_id: userId, primary_email: "amit@example.com", status: "active" },
    ]);

    await expect(
      client.repository.findAccountByIdentity({
        provider: "neon",
        providerSubject: "provider-subject",
      })
    ).resolves.toEqual({
      userId,
      primaryEmail: "amit@example.com",
      status: "active",
    });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      "SELECT * FROM distil_resolve_auth_identity($1, $2)",
      ["neon", "provider-subject"]
    );
    expect(client.query.mock.calls[0]?.[0]).not.toContain("FROM auth_identities");
  });

  it("matches the PostgreSQL adapter's empty and nullable-email mapping", async () => {
    const missing = httpClient([]);
    await expect(
      missing.repository.findAccountByIdentity({ provider: "neon", providerSubject: "missing" })
    ).resolves.toBeUndefined();

    const withoutEmail = httpClient([
      { user_id: userId, primary_email: null, status: "deletion_pending" },
    ]);
    await expect(
      withoutEmail.repository.findAccountByIdentity({ provider: "neon", providerSubject: "known" })
    ).resolves.toEqual({ userId, status: "deletion_pending" });
  });

  it("counts one HTTP statement without recording parameter values", async () => {
    const client = httpClient([]);
    const metrics = createRequestMetrics();

    await runWithRequestMetrics(
      () =>
        client.repository.findAccountByIdentity({
          provider: "neon",
          providerSubject: "private-subject",
        }),
      metrics
    );

    expect(metrics.queries).toBe(1);
    expect(metrics.transactions).toBe(0);
  });
});
