interface PackageManifest {
  dependencies?: Record<string, string>;
}

interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
  peerDependencies?: Record<string, string>;
}

interface PackageLock {
  packages?: Record<string, LockPackage>;
}

export interface DependencyPolicyFinding {
  id: "unpinned-auth-sdk" | "lock-version-drift" | "prohibited-license" | "invalid-auth-peer";
  package: string;
  detail: string;
}

function versionTuple(value: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function caretSatisfied(version: string, range: string): boolean {
  if (!range.startsWith("^")) return version === range;
  const actual = versionTuple(version);
  const minimum = versionTuple(range.slice(1));
  if (!actual || !minimum || actual[0] !== minimum[0]) return false;
  return actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]);
}

/** Offline-only checks over committed package metadata; never invokes npm or a registry. */
export function phase3DependencyPolicyFindings(
  manifest: PackageManifest,
  lock: PackageLock
): DependencyPolicyFinding[] {
  const findings: DependencyPolicyFinding[] = [];
  const declared = manifest.dependencies?.["@neondatabase/auth"];
  const locked = lock.packages?.["node_modules/@neondatabase/auth"]?.version;
  if (!declared || /^[~^*]|\s|[<>=|]/.test(declared)) {
    findings.push({
      id: "unpinned-auth-sdk",
      package: "@neondatabase/auth",
      detail: `authentication SDK must use an exact version, found ${declared ?? "missing"}`,
    });
  }
  if (declared && locked !== declared) {
    findings.push({
      id: "lock-version-drift",
      package: "@neondatabase/auth",
      detail: `manifest ${declared} does not match lock ${locked ?? "missing"}`,
    });
  }

  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path.startsWith("node_modules/") || entry.dev === true) continue;
    if (/\b(?:A?GPL)(?:-|\b)/i.test(entry.license ?? "")) {
      findings.push({
        id: "prohibited-license",
        package: `${path.slice("node_modules/".length)}@${entry.version ?? "unknown"}`,
        detail: `production dependency declares ${entry.license}`,
      });
    }
  }

  const apiKeyPath =
    "node_modules/@neondatabase/auth-ui/node_modules/@daveyplate/better-auth-ui/node_modules/@better-auth/api-key";
  const apiKey = lock.packages?.[apiKeyPath];
  const betterAuth = lock.packages?.["node_modules/@neondatabase/auth-ui/node_modules/better-auth"];
  const requiredBetterAuth = apiKey?.peerDependencies?.["better-auth"];
  if (
    requiredBetterAuth &&
    betterAuth?.version &&
    !caretSatisfied(betterAuth.version, requiredBetterAuth)
  ) {
    findings.push({
      id: "invalid-auth-peer",
      package: "@better-auth/api-key",
      detail: `requires better-auth ${requiredBetterAuth} but Neon Auth UI resolves ${betterAuth.version}`,
    });
  }
  return findings.sort((left, right) =>
    `${left.id}:${left.package}`.localeCompare(`${right.id}:${right.package}`)
  );
}
