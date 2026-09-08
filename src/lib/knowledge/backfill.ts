import { sha256 } from "./content-identity";
import { parseAuthContext, type AuthContext } from "@/lib/contracts/tenant-context";
import type {
  KnowledgeBackfillCheckpoint,
  KnowledgeBackfillStatus,
  KnowledgeBackfillType,
} from "./types";

export function createKnowledgeBackfillJobKey(
  context: AuthContext,
  jobType: KnowledgeBackfillType,
  scope: string
): string {
  const tenant = parseAuthContext(context);
  const digest = sha256(JSON.stringify([tenant.userId, jobType, scope])).slice("sha256:".length);
  return `kbf_${digest.slice(0, 32)}`;
}

export function canTransitionBackfill(
  from: KnowledgeBackfillStatus,
  to: KnowledgeBackfillStatus
): boolean {
  if (from === to) return from === "running";
  if (from === "pending") return to === "running";
  if (from === "running") return to === "completed" || to === "failed";
  if (from === "failed") return to === "running";
  return false;
}

export function createInitialBackfillCheckpoint(input: {
  context: AuthContext;
  jobType: KnowledgeBackfillType;
  scope: string;
  now: string;
}): KnowledgeBackfillCheckpoint {
  return {
    jobKey: createKnowledgeBackfillJobKey(input.context, input.jobType, input.scope),
    jobType: input.jobType,
    status: "pending",
    checkpoint: { scope: input.scope },
    processedCount: 0,
    failedCount: 0,
    attempt: 0,
    updatedAt: input.now,
  };
}
