import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const NEGATIVE_TEST_LAYERS = [
  "auth",
  "route",
  "repository",
  "database",
  "queue",
  "search",
  "ai-context",
  "cache",
  "rate-limit",
  "logging",
  "object-storage",
  "dependency",
] as const;

export type NegativeTestLayer = (typeof NEGATIVE_TEST_LAYERS)[number];

export interface NegativeTestCatalogEntry {
  id: string;
  layer: NegativeTestLayer;
  surface: string;
  threat: string;
  setup: string;
  attack: string;
  expected: string;
  delivery: "wave-1-gate" | "phase-3-exit";
}

export interface NegativeTestCatalog {
  version: 1;
  entries: NegativeTestCatalogEntry[];
}

export const REQUIRED_NEGATIVE_TEST_IDS = [
  "P3-AUTH-001",
  "P3-AUTH-002",
  "P3-CSRF-001",
  "P3-SESSION-001",
  "P3-OAUTH-001",
  "P3-ROUTE-001",
  "P3-ROUTE-002",
  "P3-REPO-001",
  "P3-DB-001",
  "P3-DB-002",
  "P3-DB-003",
  "P3-DB-004",
  "P3-QUEUE-001",
  "P3-QUEUE-002",
  "P3-QUEUE-003",
  "P3-SEARCH-001",
  "P3-AI-001",
  "P3-CACHE-001",
  "P3-RATE-001",
  "P3-LOG-001",
  "P3-OBJECT-001",
  "P3-EXPORT-001",
  "P3-EXPORT-002",
  "P3-DELETE-001",
  "P3-DELETE-002",
  "P3-RECOVERY-001",
  "P3-OUTAGE-001",
  "P3-DEPENDENCY-001",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateNegativeTestCatalog(input: unknown): string[] {
  if (!isRecord(input)) return ["negative-test catalog must be an object"];
  const issues: string[] = [];
  if (input.version !== 1) issues.push("negative-test catalog version must be 1");
  if (!Array.isArray(input.entries))
    return [...issues, "negative-test catalog entries must be an array"];

  const ids = new Set<string>();
  input.entries.forEach((raw, index) => {
    if (!isRecord(raw)) {
      issues.push(`entries[${index}] must be an object`);
      return;
    }
    for (const field of ["id", "surface", "threat", "setup", "attack", "expected"] as const) {
      if (typeof raw[field] !== "string" || raw[field].trim() === "") {
        issues.push(`entries[${index}].${field} must be a non-empty string`);
      }
    }
    if (typeof raw.id === "string") {
      if (ids.has(raw.id)) issues.push(`duplicate negative-test id: ${raw.id}`);
      ids.add(raw.id);
    }
    if (!NEGATIVE_TEST_LAYERS.includes(raw.layer as NegativeTestLayer)) {
      issues.push(`entries[${index}].layer is invalid`);
    }
    if (raw.delivery !== "wave-1-gate" && raw.delivery !== "phase-3-exit") {
      issues.push(`entries[${index}].delivery is invalid`);
    }
  });

  if (!input.entries.some((entry) => isRecord(entry) && entry.layer === "database")) {
    issues.push("negative-test catalog must include a database isolation case");
  }
  if (!input.entries.some((entry) => isRecord(entry) && entry.layer === "queue")) {
    issues.push("negative-test catalog must include a forged queue case");
  }
  for (const id of REQUIRED_NEGATIVE_TEST_IDS) {
    if (!ids.has(id)) issues.push(`negative-test catalog is missing required case: ${id}`);
  }
  return issues;
}

export function loadNegativeTestCatalog(file: string): NegativeTestCatalog {
  const parsed: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  const issues = validateNegativeTestCatalog(parsed);
  if (issues.length > 0) {
    throw new Error(`Invalid negative-test catalog:\n- ${issues.join("\n- ")}`);
  }
  return parsed as NegativeTestCatalog;
}
