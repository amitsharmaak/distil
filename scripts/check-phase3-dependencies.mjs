import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

const findings = [];
const declared = manifest.dependencies?.["@neondatabase/auth"];
const locked = lock.packages?.["node_modules/@neondatabase/auth"]?.version;
if (!declared || /^[~^*]|\s|[<>=|]/.test(declared)) {
  findings.push(
    `unpinned-auth-sdk: @neondatabase/auth must use an exact version, found ${declared ?? "missing"}`
  );
}
if (declared && locked !== declared) {
  findings.push(
    `lock-version-drift: manifest ${declared} does not match lock ${locked ?? "missing"}`
  );
}

for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith("node_modules/") || entry.dev === true) continue;
  if (/\b(?:A?GPL)(?:-|\b)/i.test(entry.license ?? "")) {
    findings.push(
      `prohibited-license: ${path.slice("node_modules/".length)}@${entry.version ?? "unknown"} declares ${entry.license}`
    );
  }
}

const tuple = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
};
const caretSatisfied = (version, range) => {
  if (!range.startsWith("^")) return version === range;
  const actual = tuple(version);
  const minimum = tuple(range.slice(1));
  return Boolean(
    actual &&
    minimum &&
    actual[0] === minimum[0] &&
    (actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]))
  );
};
const apiKey =
  lock.packages?.[
    "node_modules/@neondatabase/auth-ui/node_modules/@daveyplate/better-auth-ui/node_modules/@better-auth/api-key"
  ];
const betterAuth = lock.packages?.["node_modules/@neondatabase/auth-ui/node_modules/better-auth"];
const required = apiKey?.peerDependencies?.["better-auth"];
if (required && betterAuth?.version && !caretSatisfied(betterAuth.version, required)) {
  findings.push(
    `invalid-auth-peer: @better-auth/api-key requires better-auth ${required} but Neon Auth UI resolves ${betterAuth.version}`
  );
}

if (findings.length > 0) {
  process.stderr.write(`Phase 3 dependency gate failed:\n- ${findings.sort().join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Phase 3 dependency and license gate passed.\n");
}
