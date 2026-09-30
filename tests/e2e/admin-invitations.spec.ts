import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

import { createSessionToken } from "../../src/lib/auth/session";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/constants";
import { e2eBaseUrl } from "../support/browser/server";
import { test, expect } from "../support/browser/test";

/**
 * Settings → Invitations against the local Docker loop. The API runs on the
 * control-plane client, so the dev server needs DATABASE_CONTROL_PLANE_URL (the
 * Docker owner URL) and the legacy owner listed in DISTIL_ADMIN_USER_IDS, plus
 * this origin in DISTIL_ALLOWED_ORIGINS. The invitation link is built from
 * NEXT_PUBLIC_API_BASE_URL, which outside production may only be plain http for
 * http://localhost:3000, so run it as
 * `DISTIL_E2E_HOST=localhost DISTIL_E2E_PORT=3000 npx playwright test tests/e2e/admin-invitations.spec.ts --project=desktop-chromium`
 * with DISTIL_ALLOWED_ORIGINS=http://localhost:3000. The test skips where any of that
 * is absent (CI). It revokes the invitation it creates; the revoked row stays in
 * the throwaway local database.
 */
loadEnvConfig(process.cwd());

const loopback = /(localhost|127\.0\.0\.1)/;
const ownerId = process.env.DISTIL_LEGACY_USER_ID ?? "";
const ready = Boolean(
  process.env.DATABASE_URL &&
  process.env.DISTIL_SESSION_SECRET &&
  ownerId &&
  loopback.test(process.env.DATABASE_URL) &&
  loopback.test(process.env.DATABASE_CONTROL_PLANE_URL ?? "") &&
  (process.env.DISTIL_ADMIN_USER_IDS ?? "").toLowerCase().includes(ownerId.toLowerCase()) &&
  e2eBaseUrl === "http://localhost:3000"
);

test.describe("admin invitations", () => {
  test.skip(!ready, "needs the local Docker database with the owner in DISTIL_ADMIN_USER_IDS");

  test("an admin sends an invitation, sees the link once, and revokes it", async ({ page }) => {
    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: await createSessionToken(process.env.DISTIL_SESSION_SECRET as string),
        url: test.info().project.use.baseURL ?? "http://127.0.0.1:3100",
      },
    ]);
    const handle = `e2e-${randomUUID().slice(0, 8)}`;

    await page.goto("/settings");
    await page.getByRole("tab", { name: /Invitations/ }).click();
    await expect(page.getByText(/No invitations yet|Invitations/).first()).toBeVisible();

    await page.getByLabel("Email address").fill(`${handle}@example.test`);
    await page.getByLabel(/Note/).fill("e2e smoke");
    await page.getByRole("button", { name: "Send invitation" }).click();

    await expect(page.getByText(/will not be shown again/)).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "/invite#token=" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: `${handle[0]}***@example.test` });
    await expect(row.first()).toContainText("Pending");

    await row.first().getByRole("button", { name: "Revoke…" }).click();
    await page.getByLabel(/Reason/).fill("e2e cleanup");
    await page.getByRole("button", { name: "Revoke invitation" }).click();
    await expect(row.first()).toContainText("Revoked");
    await expect(row.first().getByRole("button", { name: "Revoke…" })).toHaveCount(0);

    // Admin-only Troubleshooting tab exists beside it.
    await expect(page.getByRole("tab", { name: /Troubleshooting/ })).toBeVisible();
  });
});
