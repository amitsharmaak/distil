import { SecretLogScanner, findPotentialSecrets } from "../support/secrets";

describe("secret log scanner", () => {
  it("recognizes capture tokens, provider keys, database credentials, and known secrets", () => {
    const text = [
      "dst_cap_abcdefghijklmnopqrstuvwxyz",
      "sk-abcdefghijklmnopqrstuvwxyz123456",
      "xoxb-1234567890-abcdefghij",
      "AIzaabcdefghijklmnopqrstuvwxyz123456",
      "postgresql://distil:super-secret@db.example.test/distil",
      "test-only-cookie-value",
    ].join(" ");

    expect(findPotentialSecrets(text, ["test-only-cookie-value"]).map(({ name }) => name)).toEqual([
      "Distil capture token",
      "OpenAI API key",
      "Slack token",
      "Google API key",
      "database URL credentials",
      "known test secret",
    ]);
  });

  it("captures structured logger arguments and reports only secret-bearing logs", () => {
    const scanner = new SecretLogScanner(["session-cookie-secret"]);
    scanner.logger.info({ token: "[REDACTED]" }, "capture accepted");
    scanner.assertNoSecrets();

    scanner.logger.error(new Error("session-cookie-secret"));
    expect(() => scanner.assertNoSecrets()).toThrow(
      "Secret material found in captured logs: known test secret"
    );
  });
});
