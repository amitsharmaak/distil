/**
 * Print the three generated values a local .env.local needs. Nothing is stored.
 *
 *   npm run local:secrets -- <password>
 */
import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "../src/lib/auth/password";

async function main(): Promise<void> {
  const password = process.argv[2];
  if (!password) throw new Error("Usage: npm run local:secrets -- <password>");
  const hash = await hashPassword(password);
  process.stdout.write(
    [
      `DISTIL_LEGACY_USER_ID=${randomUUID()}`,
      `DISTIL_SESSION_SECRET=${randomBytes(32).toString("base64url")}`,
      // Next's env loader expands `$name` even inside quotes; `\$` is the escape.
      `DISTIL_WEB_PASSWORD_HASH=${hash.replaceAll("$", "\\$")}`,
      "",
    ].join("\n")
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
