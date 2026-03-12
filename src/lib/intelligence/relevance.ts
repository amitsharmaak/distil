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

  // Unknown classification (confidence = 0 from classifier error): fail open
  if (classification.confidence === 0) {
    return { accepted: true };
  }

  // Gmail: check isContentPage first
  if (classification.isContentPage === false && classification.confidence > 0.7) {
    return {
      accepted: false,
      reason: "Not a content page (login, error, or paywall detected)",
    };
  }

  // Gmail: check email category allowlist
  const allowedCategories = parseAllowedCategories(
    getUserSetting(EMAIL_INTELLIGENCE_KEY),
  );

  const emailCategory = classification.emailCategory;
  if (!emailCategory) {
    // No category classified — accept to avoid dropping content
    return { accepted: true };
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
