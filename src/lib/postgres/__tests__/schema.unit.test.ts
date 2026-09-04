import * as schema from "../schema";

it("exports every legacy and Phase 1 PostgreSQL table", () => {
  expect(Object.keys(schema).sort()).toEqual(
    [
      "agentActions",
      "aiSummaries",
      "approvalQueue",
      "auditLog",
      "captureRequests",
      "captureTokens",
      "chatConversations",
      "chatMessages",
      "feedback",
      "itemEmbeddings",
      "items",
      "jobQueue",
      "notifications",
      "oauthTokens",
      "publisherQueue",
      "rateLimitWindows",
      "rawContent",
      "researchReports",
      "researchSuggestions",
      "userSettings",
      "workflowRuns",
    ].sort()
  );
});

it("exposes relational metadata for critical capture tables", () => {
  expect(schema.captureRequests.id).toBeDefined();
  expect(schema.captureRequests.normalizedUrl).toBeDefined();
  expect(schema.captureTokens.tokenHash).toBeDefined();
  expect(schema.rateLimitWindows.windowStart).toBeDefined();
  expect(schema.rawContent.itemId).toBeDefined();
});
