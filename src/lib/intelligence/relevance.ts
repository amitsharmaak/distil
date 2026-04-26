/**
 * Stage 2 of the Unified Intelligence Layer — Relevance Gate.
 *
 * Decides whether content passes the relevance filter (e.g. email category
 * allowlist) and proceeds to extraction. Non-email sources always pass.
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import type {
  RawContent,
  ContentClassification,
  RelevanceResult,
  EmailCategory,
} from "./types";

/**
 * When the AI classifier omits emailCategory, infer newsletter-like intent from
 * Gmail headers and tab labels (mirrors connector-side triage heuristics).
 */
function inferEmailCategoryFromGmailSignals(
  raw: RawContent,
): EmailCategory | null {
  const headers = raw.metadata.headers ?? {};
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = headers[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    const lower = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    for (const k of keys) {
      const v = lower[k.toLowerCase()];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
  };

  const listUnsub = pick("List-Unsubscribe");
  const listId = pick("List-Id");
  const precedence = pick("Precedence").toLowerCase();
  const autoSub = pick("Auto-Submitted").toLowerCase();

  const bulkLike =
    precedence.includes("bulk") ||
    precedence.includes("list") ||
    autoSub.includes("auto-generated");

  if (listUnsub || listId || bulkLike) {
    return "newsletter";
  }

  const labels = raw.metadata.labels ?? [];
  if (labels.includes("CATEGORY_UPDATES") || labels.includes("CATEGORY_FORUMS")) {
    return "digest";
  }
  if (labels.includes("CATEGORY_PROMOTIONS")) {
    return "promotional";
  }

  return null;
}

const DEFAULT_ALLOWED_CATEGORIES: EmailCategory[] = [
  "newsletter",
  "digest",
  "announcement",
];

const EMAIL_INTELLIGENCE_KEY = "email_intelligence_categories";

function parseAllowedCategories(
  value: string | undefined,
): EmailCategory[] {
  if (!value) return DEFAULT_ALLOWED_CATEGORIES;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_ALLOWED_CATEGORIES;
    const valid = new Set<string>([
      "newsletter",
      "digest",
      "transactional",
      "personal",
      "promotional",
      "notification",
      "automated",
      "announcement",
      "unknown",
    ]);
    const filtered = parsed.filter((c): c is EmailCategory =>
      typeof c === "string" && valid.has(c),
    );
    return filtered.length > 0 ? filtered : DEFAULT_ALLOWED_CATEGORIES;
  } catch {
    return DEFAULT_ALLOWED_CATEGORIES;
  }
}

export async function checkRelevance(
  raw: RawContent,
  classification: ContentClassification,
  getUserSetting: (key: string) => string | undefined,
): Promise<RelevanceResult> {
  // Non-email sources: always accept
  if (raw.sourceType !== "gmail") {
    return { accepted: true };
  }

  // Gmail: check isContentPage first
  if (classification.isContentPage === false && classification.confidence > 0.7) {
    return {
      accepted: false,
      reason: "Not a content page (login, error, or paywall detected)",
    };
  }

  const allowedCategories = parseAllowedCategories(
    getUserSetting(EMAIL_INTELLIGENCE_KEY),
  );

  const inferred = inferEmailCategoryFromGmailSignals(raw);
  const emailCategory: EmailCategory | undefined =
    classification.emailCategory ?? inferred ?? undefined;

  if (!emailCategory) {
    return {
      accepted: false,
      reason:
        "Not identified as a newsletter or digest (no matching category or newsletter signals)",
    };
  }

  if (!allowedCategories.includes(emailCategory)) {
    return {
      accepted: false,
      reason: `Email category "${emailCategory}" is not in your allowed list`,
    };
  }

  return {
    accepted: true,
    matchedCategory: emailCategory,
  };
}
