import { execFileSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import type { Page } from "@playwright/test";

import { SESSION_COOKIE_NAME } from "../../../src/lib/auth/constants";
import { createSessionToken } from "../../../src/lib/auth/session";
import { e2eBaseUrl } from "./server";

loadEnvConfig(process.cwd());

/**
 * True where the pages are server-rendered with real data behind a real session: the local
 * PostgreSQL and legacy-auth values from docs/runbooks/local-development.md. CI has neither a
 * user nor a session, so there the pages render empty islands that fetch from the API.
 */
export const seededSessionReady = Boolean(
  process.env.DATABASE_URL &&
  process.env.DISTIL_SESSION_SECRET &&
  process.env.DISTIL_WEB_PASSWORD_HASH &&
  process.env.DISTIL_LEGACY_USER_ID &&
  process.env.DISTIL_TEST_MODE !== "1" &&
  /(localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL)
);

const TENANT_SCRIPT = `
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
(async () => {
  const unwrap = (module: any) => module.default ?? module;
  const { withTenantRepositories } = unwrap(await import("./src/lib/database"));
  const { createAuthContext } = unwrap(await import("./src/lib/contracts"));
  const [mode, label, ids] = JSON.parse(process.env.E2E_FIXTURE_ARGS as string);
  const userId = process.env.DISTIL_LEGACY_USER_ID as string;
  const context = createAuthContext({
    userId,
    actorKind: "user",
    actorId: userId,
    requestId: crypto.randomUUID(),
  });
  const created: string[] = [];
  await withTenantRepositories(context, async (repositories) => {
    if (mode === "cleanup") {
      for (const id of ids) await repositories.items.delete(id);
      return;
    }
    const base = Date.now();
    for (let index = 0; index < 2; index += 1) {
      const stored = await repositories.items.insert({
        id: "e2e-" + label + "-" + index,
        title: "Fixture " + label + " " + (index + 1),
        summary: "A deterministic item for an end-to-end test.",
        fullContent: "Fixture body text.",
        sourceType: "manual",
        contentType: "article",
        topics: ["testing"],
        url: "https://articles.example.test/" + label + "-" + index,
        priority: "high",
        isRead: false,
        createdAt: new Date(base + (2 - index) * 1000).toISOString(),
        processingStatus: "ready",
      });
      created.push(stored.id);
    }
  });
  process.stdout.write("IDS:" + JSON.stringify(created));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

function run(mode: "seed" | "cleanup", label: string, ids: string[] = []): string[] {
  const output = execFileSync("npx", ["tsx", "--eval", TENANT_SCRIPT], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, E2E_FIXTURE_ARGS: JSON.stringify([mode, label, ids]) },
  });
  const match = /IDS:(\[.*\])/.exec(output);
  return match ? (JSON.parse(match[1]) as string[]) : [];
}

/** Insert two unread fixture items for the local owner; returns their ids. */
export function seedFixtureItems(label: string): string[] {
  return run("seed", label);
}

export function removeFixtureItems(label: string, ids: string[]): void {
  if (ids.length > 0) run("cleanup", label, ids);
}

/** Present a valid legacy session cookie for the local owner. */
export async function addSessionCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: await createSessionToken(process.env.DISTIL_SESSION_SECRET as string),
      url: e2eBaseUrl,
    },
  ]);
}
