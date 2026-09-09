import { phase3AuthActivationFindings } from "../src/lib/operations/phase3-auth-activation";

const conditional = process.argv.includes("--if-enabled");
if (conditional && process.env.FEATURE_NEON_AUTH !== "true") {
  process.stdout.write("Phase 3 hosted-auth activation preflight skipped (feature disabled).\n");
} else {
  const findings = phase3AuthActivationFindings(process.env);
  if (process.argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ passed: findings.length === 0, findings }, null, 2)}\n`
    );
  } else if (findings.length > 0) {
    process.stderr.write(
      `Phase 3 hosted-auth activation preflight failed with ${findings.length} finding(s):\n${findings
        .map(({ id, detail }) => `- ${id}: ${detail}`)
        .join("\n")}\n`
    );
  } else {
    process.stdout.write("Phase 3 hosted-auth activation preflight passed.\n");
  }
  if (findings.length > 0) process.exitCode = 1;
}
