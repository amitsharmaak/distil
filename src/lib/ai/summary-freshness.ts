/**
 * Whether a stored detailed summary still belongs with the stored brief.
 *
 * A detailed summary (summary-v2) is a delta over one particular brief and records that
 * brief's row id as `structured.briefId`. Regenerating the brief writes a new row id, so the
 * old detailed summary no longer matches and is rebuilt the next time it is opened. Pre-S2
 * detailed summaries carry no brief id; they were written independently of the brief and stay
 * until the brief is regenerated after them.
 *
 * Pure and dependency-free: used by the summary generator and the summaries repository.
 */

interface StoredSummary {
  id: string;
  createdAt: string;
  structured?: unknown;
}

export function detailedBriefId(structured: unknown): string | undefined {
  if (!structured || typeof structured !== "object") return undefined;
  const briefId = (structured as { briefId?: unknown }).briefId;
  return typeof briefId === "string" && briefId ? briefId : undefined;
}

export function isDetailedCurrent(
  brief: Pick<StoredSummary, "id" | "createdAt"> | undefined,
  detailed: Pick<StoredSummary, "createdAt" | "structured">
): boolean {
  const briefId = detailedBriefId(detailed.structured);
  if (briefId) return brief?.id === briefId;
  if (!brief) return true;
  return Date.parse(brief.createdAt) <= Date.parse(detailed.createdAt);
}
