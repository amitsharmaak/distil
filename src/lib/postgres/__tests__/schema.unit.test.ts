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
      "collectionItems",
      "collections",
      "annotations",
      "digestItems",
      "digestRuns",
      "feedback",
      "itemEmbeddings",
      "itemEvents",
      "itemNotes",
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
  expect(schema.items.readingProgress).toBeDefined();
  expect(schema.itemNotes.itemId).toBeDefined();
  expect(schema.annotations.contentVersion).toBeDefined();
  expect(schema.annotations.contentHash).toBeDefined();
  expect(schema.collectionItems.collectionId).toBeDefined();
  expect(schema.itemEvents.eventKey).toBeDefined();
  expect(schema.digestRuns.digestDate).toBeDefined();
});
