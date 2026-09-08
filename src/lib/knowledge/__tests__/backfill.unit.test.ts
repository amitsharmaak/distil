import {
  canTransitionBackfill,
  createInitialBackfillCheckpoint,
  createKnowledgeBackfillJobKey,
} from "../backfill";
import { createAuthContext } from "@/lib/contracts/tenant-context";

const context = createAuthContext({
  userId: "10000000-0000-4000-8000-000000000001",
  actorKind: "system",
  actorId: "20000000-0000-4000-8000-000000000001",
  requestId: "30000000-0000-4000-8000-000000000001",
});

describe("knowledge backfill contracts", () => {
  it("uses one stable key for retrying the same job scope", () => {
    const first = createKnowledgeBackfillJobKey(context, "content_versions", "ready-items:v1");
    expect(createKnowledgeBackfillJobKey(context, "content_versions", "ready-items:v1")).toBe(
      first
    );
    expect(createKnowledgeBackfillJobKey(context, "chunks", "ready-items:v1")).not.toBe(first);
    expect(first).toMatch(/^kbf_[0-9a-f]{32}$/);
  });

  it("creates a durable empty checkpoint", () => {
    expect(
      createInitialBackfillCheckpoint({
        context,
        jobType: "content_versions",
        scope: "ready-items:v1",
        now: "2026-09-07T00:00:00.000Z",
      })
    ).toMatchObject({
      jobType: "content_versions",
      status: "pending",
      checkpoint: { scope: "ready-items:v1" },
      processedCount: 0,
      failedCount: 0,
      attempt: 0,
    });
  });

  it("supports retries but treats completion as terminal", () => {
    expect(canTransitionBackfill("pending", "running")).toBe(true);
    expect(canTransitionBackfill("running", "running")).toBe(true);
    expect(canTransitionBackfill("running", "failed")).toBe(true);
    expect(canTransitionBackfill("failed", "running")).toBe(true);
    expect(canTransitionBackfill("running", "completed")).toBe(true);
    expect(canTransitionBackfill("completed", "running")).toBe(false);
  });
});
