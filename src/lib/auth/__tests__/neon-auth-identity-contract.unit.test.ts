import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adr = readFileSync(
  resolve(process.cwd(), "docs/adr/0003-neon-auth-invitation-foundation.md"),
  "utf8"
);
const normalizedAdr = adr.replace(/\s+/gu, " ");

describe("Phase 3 Neon Auth identity contract", () => {
  it("uses application-owned identity mapping instead of a provider subject on users", () => {
    expect(adr).toContain("`auth_identities(provider, provider_subject, user_id)` table");
    expect(adr).toContain("`users` must not store a Neon subject");
    expect(adr).not.toContain("neon_auth_user_id");
  });

  it("keeps access personal and denies verified identities without an active mapping", () => {
    expect(normalizedAdr).toContain("strictly personal `user_id` tenancy");
    expect(normalizedAdr).toContain(
      "no workspace, membership, or workspace ownership tables or predicates"
    );
    expect(normalizedAdr).toContain(
      "Only the magic-link plugin is enabled for the first user-facing flow"
    );
    expect(normalizedAdr).toContain(
      "only after a verified email and successful invite consumption"
    );
    expect(normalizedAdr).toContain("A verified identity with no mapped active user is denied");
  });
});
