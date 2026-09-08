import { readFileSync } from "node:fs";

describe("Neon Auth runtime dependency boundary", () => {
  it.each(["@neondatabase/auth/next", "@neondatabase/auth/next/server"])(
    "%s is resolved from the official SDK without loading Auth UI",
    (specifier) => {
      const source = readFileSync(require.resolve(specifier), "utf8");
      expect(source).not.toContain("@neondatabase/auth-ui");
    }
  );

  it("fails closed if an unused Auth UI export is imported", async () => {
    const specifier = "@neondatabase/auth-ui";
    await expect(import(specifier)).rejects.toThrow("Neon Auth UI is disabled in Distil");
  });
});
