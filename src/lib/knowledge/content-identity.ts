import { createHash } from "node:crypto";

export const SHA256_PREFIX = "sha256:";

export function sha256(value: string): string {
  return `${SHA256_PREFIX}${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export interface ContentVersionIdentityInput {
  itemId: string;
  content: string;
  extractorVersion: string;
}

export interface ContentVersionIdentity {
  id: string;
  contentHash: string;
}

/**
 * Produces the retry-safe identity used by content-version backfills.
 *
 * The content hash deliberately covers only source text. The row identity also
 * covers the item and extractor because equal text on two items, or a later
 * extractor release, are distinct immutable versions.
 */
export function createContentVersionIdentity(
  input: ContentVersionIdentityInput
): ContentVersionIdentity {
  const contentHash = sha256(input.content);
  const identityHash = sha256(
    JSON.stringify([input.itemId, input.extractorVersion, contentHash])
  ).slice(SHA256_PREFIX.length);

  return {
    id: `cv_${identityHash.slice(0, 32)}`,
    contentHash,
  };
}
