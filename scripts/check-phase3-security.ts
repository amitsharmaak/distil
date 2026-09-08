import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeConnectorReturnPath } from "../src/lib/connectors/oauth-state";
import {
  loadCsrfRouteExemptions,
  loadNeonCsrfBoundaryReview,
  loadPhase3AuthorizationInventory,
  mutationOriginProtectionIssues,
  phase3AuthorizationInventoryIssues,
} from "../tests/support/phase3-authorization-inventory";
import { phase3DependencyPolicyFindings } from "../tests/support/dependency-policy";

const root = process.cwd();
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const findings: { id: string; detail: string }[] = [];

const inventory = loadPhase3AuthorizationInventory(resolve(root, "docs/authorization-matrix.json"));
for (const detail of phase3AuthorizationInventoryIssues(inventory, root)) {
  findings.push({ id: "authorization-inventory-drift", detail });
}
const csrfExemptions = loadCsrfRouteExemptions(
  resolve(root, "tests/fixtures/phase3/csrf-route-exemptions.json")
);
const neonCsrfBoundary = loadNeonCsrfBoundaryReview(
  resolve(root, "tests/fixtures/phase3/neon-csrf-boundary.json")
);
for (const detail of mutationOriginProtectionIssues(
  inventory,
  csrfExemptions,
  neonCsrfBoundary,
  root
)) {
  findings.push({ id: "csrf-coverage", detail });
}

const normalizedBackslash = normalizeConnectorReturnPath("/\\hostile.example");
if (new URL(normalizedBackslash, "https://distil.example").origin !== "https://distil.example") {
  findings.push({
    id: "oauth-return-path",
    detail: `backslash return path remains externally redirectable: ${normalizedBackslash}`,
  });
}

const oauthStateSource = readFileSync(resolve(root, "src/lib/connectors/oauth-state.ts"), "utf8");
const consumeInput = oauthStateSource.match(
  /consume\(input:\s*\{([\s\S]*?)\}\):\s*Promise<ConnectorOAuthState/
)?.[1];
if (
  !consumeInput ||
  !/\buserId\s*:/.test(consumeInput) ||
  !/\bsessionId\??\s*:/.test(consumeInput)
) {
  findings.push({
    id: "oauth-state-consume",
    detail:
      "OAuth state is destructively consumed before the repository can bind the claimant user/session",
  });
}

const loggerSource = readFileSync(resolve(root, "src/lib/logger.ts"), "utf8");
if (
  !/\bredact\s*:/.test(loggerSource) &&
  !/\b(?:redactLog|sanitizeLog|logAllowlist)\b/.test(loggerSource)
) {
  findings.push({
    id: "log-redaction",
    detail: "structured logger has no central redaction or allowlist configuration",
  });
}

const magicLinkSource = readFileSync(resolve(root, "src/lib/auth/magic-link.ts"), "utf8");
if (
  !/\b(?:enforceRateLimit|claimInvitationForDelivery|reserveInvitationDelivery|claimInvitationDispatch)\b/.test(
    magicLinkSource
  )
) {
  findings.push({
    id: "invitation-replay",
    detail:
      "invitation magic-link dispatch has no durable per-invitation replay/rate-limit control",
  });
}

for (const dependency of phase3DependencyPolicyFindings(
  readJson("package.json") as never,
  readJson("package-lock.json") as never
)) {
  findings.push({ id: dependency.id, detail: `${dependency.package}: ${dependency.detail}` });
}

findings.sort((left, right) =>
  `${left.id}:${left.detail}`.localeCompare(`${right.id}:${right.detail}`)
);
if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify({ passed: findings.length === 0, findings }, null, 2)}\n`);
} else if (findings.length > 0) {
  process.stderr.write(
    `Phase 3 security audit failed with ${findings.length} finding(s):\n${findings
      .map(({ id, detail }) => `- ${id}: ${detail}`)
      .join("\n")}\n`
  );
} else {
  process.stdout.write("Phase 3 deterministic security audit passed.\n");
}
if (findings.length > 0) process.exitCode = 1;
