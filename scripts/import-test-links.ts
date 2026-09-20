/**
 * Bulk-imports docs/test-links/links.json into a Distil instance through the
 * capture API. Usage:
 *
 *   npm run links:import -- --origin http://localhost:3000 --token <capture token>
 *   npm run links:import -- --origin https://distilai.app --token <token> --category youtube
 *   npm run links:import -- --dry-run
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface TestLink {
  url: string;
  category: string;
  label: string;
  added: string;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const registry = JSON.parse(
    readFileSync(resolve(process.cwd(), "docs/test-links/links.json"), "utf8")
  ) as { links: TestLink[] };
  const category = argument("category");
  const links = registry.links.filter((link) => !category || link.category === category);
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    for (const link of links) console.log(`${link.category.padEnd(14)} ${link.url}`);
    console.log(`${links.length} link(s).`);
    return;
  }

  const origin = argument("origin") ?? process.env.DISTIL_ORIGIN;
  const token = argument("token") ?? process.env.DISTIL_CAPTURE_TOKEN;
  if (!origin || !token) {
    console.error("Pass --origin and --token (or DISTIL_ORIGIN / DISTIL_CAPTURE_TOKEN).");
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (const link of links) {
    const response = await fetch(`${new URL(origin).origin}/api/v1/captures`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: link.url, source: "web" }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      duplicate?: boolean;
      receipt?: { status?: string; id?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      failures += 1;
      console.log(`FAIL   ${link.url} — ${response.status} ${payload.error?.message ?? ""}`);
      continue;
    }
    const state = payload.duplicate ? "exists" : (payload.receipt?.status ?? "queued");
    console.log(`${state.padEnd(6)} ${link.category.padEnd(14)} ${link.url}`);
  }
  console.log(`${links.length - failures}/${links.length} accepted.`);
  if (failures > 0) process.exitCode = 1;
}

void main();
