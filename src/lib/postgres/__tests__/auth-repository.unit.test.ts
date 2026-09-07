import type { Sql } from "postgres";

import { PostgresAuthRepository } from "../auth-repository";

function sqlDouble(rowsByOperation: Record<string, unknown[]>) {
  const queries: string[] = [];
  const sql = jest.fn(async (strings: TemplateStringsArray) => {
    const query = strings.join("?");
    queries.push(query);
    const operation = Object.keys(rowsByOperation).find((key) => query.includes(key));
    return operation ? rowsByOperation[operation] : [];
  }) as unknown as Sql;
  return { sql, queries };
}

describe("PostgresAuthRepository", () => {
  it("uses exact-key security-definer functions for runtime identity lookup", async () => {
    const fake = sqlDouble({
      distil_resolve_auth_identity: [
        {
          user_id: "11111111-1111-4111-8111-111111111111",
          primary_email: "amit@example.com",
          status: "active",
        },
      ],
    });
    const repository = new PostgresAuthRepository(fake.sql);

    await expect(
      repository.findAccountByIdentity({ provider: "neon", providerSubject: "subject-1" })
    ).resolves.toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      primaryEmail: "amit@example.com",
      status: "active",
    });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]).toContain("distil_resolve_auth_identity");
    expect(fake.queries[0]).not.toContain("FROM auth_identities");
  });

  it("consumes and links invitations through one atomic database function", async () => {
    const fake = sqlDouble({
      distil_consume_invitation: [
        {
          user_id: "22222222-2222-4222-8222-222222222222",
          primary_email: "beta@example.com",
          status: "active",
        },
      ],
    });
    const repository = new PostgresAuthRepository(fake.sql);

    await expect(
      repository.consumeInvitationAndLinkIdentity({
        invitationId: "33333333-3333-4333-8333-333333333333",
        tokenHash: "token-hash",
        emailHash: "email-hash",
        provider: "neon",
        providerSubject: "subject-2",
        providerSessionId: "session-2",
        consumedAt: "2026-09-07T00:00:00.000Z",
      })
    ).resolves.toMatchObject({
      userId: "22222222-2222-4222-8222-222222222222",
      status: "active",
    });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]).toContain("distil_consume_invitation");
  });
});
