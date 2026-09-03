const DEFAULT_SECRET_PATTERNS: ReadonlyArray<{
  name: string;
  pattern: RegExp;
}> = [
  { name: "Distil capture token", pattern: /\bdst_cap_[A-Za-z0-9_-]{8,}\b/g },
  { name: "OpenAI API key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "Google API key", pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/g },
  {
    name: "database URL credentials",
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi,
  },
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
];

export interface SecretFinding {
  name: string;
  match: string;
}

export interface SecretLogEntry {
  level: "debug" | "info" | "warn" | "error";
  values: unknown[];
}

function serialize(value: unknown): string {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
    if (nestedValue instanceof Error) {
      return {
        name: nestedValue.name,
        message: nestedValue.message,
        stack: nestedValue.stack,
      };
    }
    if (typeof nestedValue === "bigint") {
      return nestedValue.toString();
    }
    if (nestedValue && typeof nestedValue === "object") {
      if (seen.has(nestedValue)) return "[Circular]";
      seen.add(nestedValue);
    }
    return nestedValue;
  });
  return serialized ?? String(value);
}

export function findPotentialSecrets(
  value: unknown,
  knownSecrets: readonly string[] = []
): SecretFinding[] {
  const text = typeof value === "string" ? value : serialize(value);
  const findings: SecretFinding[] = [];

  for (const { name, pattern } of DEFAULT_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({ name, match: match[0] });
    }
  }

  for (const secret of knownSecrets) {
    if (secret.length > 0 && text.includes(secret)) {
      findings.push({ name: "known test secret", match: secret });
    }
  }

  return findings;
}

export class SecretLogScanner {
  readonly entries: SecretLogEntry[] = [];
  readonly logger = {
    debug: (...values: unknown[]) => this.record("debug", values),
    info: (...values: unknown[]) => this.record("info", values),
    warn: (...values: unknown[]) => this.record("warn", values),
    error: (...values: unknown[]) => this.record("error", values),
  };

  constructor(private readonly knownSecrets: readonly string[] = []) {}

  findings(): SecretFinding[] {
    return this.entries.flatMap((entry) => findPotentialSecrets(entry.values, this.knownSecrets));
  }

  assertNoSecrets(): void {
    const findings = this.findings();
    if (findings.length === 0) return;

    const kinds = [...new Set(findings.map((finding) => finding.name))].join(", ");
    throw new Error(`Secret material found in captured logs: ${kinds}`);
  }

  reset(): void {
    this.entries.length = 0;
  }

  private record(level: SecretLogEntry["level"], values: unknown[]): void {
    this.entries.push({ level, values });
  }
}
