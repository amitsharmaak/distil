import { sha256 } from "./content-identity";
import type { ClaimEvidence } from "./types";

export function createClaimEvidence(input: {
  claimId: string;
  chunkId: string;
  chunkContent: string;
  startOffset: number;
  endOffset: number;
}): ClaimEvidence {
  const { startOffset, endOffset, chunkContent } = input;
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset <= startOffset ||
    endOffset > chunkContent.length
  ) {
    throw new Error("Evidence offsets must identify a non-empty span inside the chunk");
  }

  const exactExcerpt = chunkContent.slice(startOffset, endOffset);
  if (!/[\p{L}\p{N}]/u.test(exactExcerpt)) {
    throw new Error("Evidence must contain source text, not only whitespace or punctuation");
  }

  return {
    claimId: input.claimId,
    chunkId: input.chunkId,
    startOffset,
    endOffset,
    exactExcerpt,
    evidenceHash: sha256(exactExcerpt),
  };
}
