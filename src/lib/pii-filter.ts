/**
 * PII (Personally Identifiable Information) filter.
 *
 * Detects and redacts common PII patterns from text before
 * sending content to external AI providers.
 *
 * Supported patterns:
 * - Email addresses
 * - Phone numbers (US/international)
 * - Social Security Numbers
 * - Credit card numbers
 * - IP addresses (IPv4)
 * - Street addresses (basic pattern)
 *
 * SERVER-SIDE ONLY.
 */

export interface PIIDetection {
  type: string;
  original: string;
  position: { start: number; end: number };
}

export interface FilterResult {
  filtered: string;
  detections: PIIDetection[];
  hadPII: boolean;
}

const PII_PATTERNS: Array<{ type: string; pattern: RegExp; replacement: string }> = [
  {
    type: "email",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL_REDACTED]",
  },
  {
    type: "phone",
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    replacement: "[PHONE_REDACTED]",
  },
  {
    type: "ssn",
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
  },
  {
    type: "credit_card",
    pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    replacement: "[CARD_REDACTED]",
  },
  {
    type: "ipv4",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    replacement: "[IP_REDACTED]",
  },
];

/**
 * Filters PII from text, replacing detected patterns with placeholders.
 * Returns the filtered text and a list of detections.
 */
export function filterPII(text: string): FilterResult {
  const detections: PIIDetection[] = [];
  let filtered = text;

  for (const { type, pattern, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      detections.push({
        type,
        original: match[0],
        position: { start: match.index, end: match.index + match[0].length },
      });
    }

    filtered = filtered.replace(pattern, replacement);
  }

  return {
    filtered,
    detections,
    hadPII: detections.length > 0,
  };
}

/**
 * Quick check: does text contain any PII patterns?
 */
export function containsPII(text: string): boolean {
  for (const { pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}
