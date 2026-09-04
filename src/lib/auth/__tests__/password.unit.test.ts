import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("scrypt password storage", () => {
  it("creates a self-describing scrypt hash and verifies the password", async () => {
    const encoded = await hashPassword("correct horse", Buffer.alloc(16, 7));
    expect(encoded).toMatch(/^scrypt\$16384\$8\$1\$/);
    await expect(verifyPassword("correct horse", encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong horse", encoded)).resolves.toBe(false);
  });

  it.each([
    "",
    "sha256$16384$8$1$c2FsdA$aGFzaA",
    "scrypt$not-a-number$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaA",
    "scrypt$1073741824$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaA",
    "scrypt$16384$8$1$bad$bad",
  ])("rejects malformed or unsafe hash %s", async (encoded) => {
    await expect(verifyPassword("password", encoded)).resolves.toBe(false);
  });
});
