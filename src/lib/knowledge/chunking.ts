import { sha256 } from "./content-identity";

export const DEFAULT_CHUNK_OPTIONS = {
  minTokens: 400,
  targetTokens: 500,
  maxTokens: 600,
} as const;

export interface ChunkOptions {
  minTokens?: number;
  targetTokens?: number;
  maxTokens?: number;
}

export interface ContentChunk {
  id: string;
  contentVersionId: string;
  ordinal: number;
  content: string;
  contentHash: string;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
}

interface TokenSpan {
  start: number;
  end: number;
}

type BoundaryKind = "paragraph" | "sentence" | "token";

const tokenPattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s]/gu;
const sentenceTerminalPattern = /[.!?。！？]/u;

export function estimateTokenCount(content: string): number {
  return tokenize(content).length;
}

/**
 * Splits source text into deterministic, source-addressable chunks.
 *
 * Chunk sizes are balanced into the requested 400–600 token window whenever
 * mathematically possible. Short documents and the unavoidable 601–799 token
 * case are balanced as closely as possible. Paragraph ends are preferred over
 * sentence ends, then a token boundary is used as the safe fallback.
 */
export function chunkContent(
  contentVersionId: string,
  content: string,
  options: ChunkOptions = {}
): ContentChunk[] {
  const minTokens = options.minTokens ?? DEFAULT_CHUNK_OPTIONS.minTokens;
  const targetTokens = options.targetTokens ?? DEFAULT_CHUNK_OPTIONS.targetTokens;
  const maxTokens = options.maxTokens ?? DEFAULT_CHUNK_OPTIONS.maxTokens;
  validateOptions(minTokens, targetTokens, maxTokens);

  const tokens = tokenize(content);
  if (tokens.length === 0) return [];

  const chunkCount = chooseChunkCount(tokens.length, minTokens, targetTokens, maxTokens);
  const boundaries = classifyBoundaries(content, tokens);
  const cuts: number[] = [0];

  for (let chunkIndex = 1; chunkIndex < chunkCount; chunkIndex += 1) {
    const previous = cuts[cuts.length - 1];
    const remainingChunks = chunkCount - chunkIndex;
    const ideal = Math.round((tokens.length * chunkIndex) / chunkCount);
    const lower = Math.max(
      previous + 1,
      previous + minTokens,
      tokens.length - remainingChunks * maxTokens
    );
    const upper = Math.min(
      tokens.length - remainingChunks,
      previous + maxTokens,
      tokens.length - remainingChunks * minTokens
    );

    // Some totals cannot be partitioned wholly inside the requested window
    // (for example 700 tokens). Relax only the minimum and keep max hard.
    const relaxedLower = Math.max(previous + 1, tokens.length - remainingChunks * maxTokens);
    const relaxedUpper = Math.min(tokens.length - remainingChunks, previous + maxTokens);
    cuts.push(
      chooseCut(
        boundaries,
        lower <= upper ? lower : relaxedLower,
        lower <= upper ? upper : relaxedUpper,
        ideal
      )
    );
  }
  cuts.push(tokens.length);

  return cuts.slice(0, -1).map((tokenStart, ordinal) => {
    const tokenEnd = cuts[ordinal + 1];
    const startOffset = tokens[tokenStart].start;
    const endOffset = tokens[tokenEnd - 1].end;
    const chunk = content.slice(startOffset, endOffset);
    const contentHash = sha256(chunk);
    const stableKey = JSON.stringify([
      contentVersionId,
      ordinal,
      startOffset,
      endOffset,
      contentHash,
    ]);

    return {
      id: `chk_${sha256(stableKey).slice("sha256:".length, "sha256:".length + 32)}`,
      contentVersionId,
      ordinal,
      content: chunk,
      contentHash,
      startOffset,
      endOffset,
      tokenCount: tokenEnd - tokenStart,
    };
  });
}

function tokenize(content: string): TokenSpan[] {
  return Array.from(content.matchAll(tokenPattern), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function chooseChunkCount(
  total: number,
  minTokens: number,
  targetTokens: number,
  maxTokens: number
): number {
  if (total <= maxTokens) return 1;

  const minimumChunks = Math.ceil(total / maxTokens);
  const maximumChunks = Math.floor(total / minTokens);
  const targetChunks = Math.max(1, Math.round(total / targetTokens));

  if (minimumChunks <= maximumChunks) {
    return Math.min(maximumChunks, Math.max(minimumChunks, targetChunks));
  }

  return minimumChunks;
}

function classifyBoundaries(content: string, tokens: TokenSpan[]): Map<number, BoundaryKind> {
  const boundaries = new Map<number, BoundaryKind>();

  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const next = tokens[index];
    const gap = content.slice(previous.end, next.start);
    const previousToken = content.slice(previous.start, previous.end);

    if (/\r?\n[\t ]*\r?\n/u.test(gap)) {
      boundaries.set(index, "paragraph");
    } else if (sentenceTerminalPattern.test(previousToken) && /\s/u.test(gap)) {
      boundaries.set(index, "sentence");
    } else {
      boundaries.set(index, "token");
    }
  }

  return boundaries;
}

function chooseCut(
  boundaries: Map<number, BoundaryKind>,
  lower: number,
  upper: number,
  ideal: number
): number {
  let best = Math.min(upper, Math.max(lower, ideal));
  let bestScore = Number.POSITIVE_INFINITY;
  const penalty: Record<BoundaryKind, number> = { paragraph: 0, sentence: 24, token: 48 };

  for (let candidate = lower; candidate <= upper; candidate += 1) {
    const kind = boundaries.get(candidate) ?? "token";
    const score = Math.abs(candidate - ideal) + penalty[kind];
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function validateOptions(minTokens: number, targetTokens: number, maxTokens: number): void {
  if (
    !Number.isInteger(minTokens) ||
    !Number.isInteger(targetTokens) ||
    !Number.isInteger(maxTokens) ||
    minTokens <= 0 ||
    minTokens > targetTokens ||
    targetTokens > maxTokens
  ) {
    throw new Error("Chunk sizes must be positive integers satisfying min <= target <= max");
  }
}
