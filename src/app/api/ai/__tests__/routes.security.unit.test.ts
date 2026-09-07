process.env.DB_PATH = ":memory:";

jest.mock("@/lib/database", () => ({
  getItemById: jest.fn(),
  insertFeedback: jest.fn(),
}));
jest.mock("@/lib/ai/summarize", () => ({ generateSummary: jest.fn() }));
jest.mock("@/lib/ai/preferences", () => ({ updatePreferencesFromFeedback: jest.fn() }));
jest.mock("@/lib/ai/prioritize", () => ({ reprioritize: jest.fn() }));

import { NextRequest } from "next/server";
import { POST as summarize } from "../summarize/route";
import { POST as feedback } from "../feedback/route";
import { generateSummary } from "@/lib/ai/summarize";
import { getItemById, insertFeedback } from "@/lib/database";

const mockGenerateSummary = generateSummary as jest.MockedFunction<typeof generateSummary>;
const mockGetItemById = getItemById as jest.MockedFunction<typeof getItemById>;
const mockInsertFeedback = insertFeedback as jest.MockedFunction<typeof insertFeedback>;

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("does not expose provider errors from summary generation", async () => {
  mockGetItemById.mockResolvedValue({ id: "item-1", url: "https://example.com" } as never);
  mockGenerateSummary.mockRejectedValue(new Error("provider-secret-detail"));

  const response = await summarize(request("/api/ai/summarize", { itemId: "item-1" }));

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Failed to generate summary" });
});

it("rejects oversized feedback reasons before reading or writing the database", async () => {
  const response = await feedback(
    request("/api/ai/feedback", { itemId: "item-1", rating: 1, reason: "x".repeat(1_001) })
  );

  expect(response.status).toBe(400);
  expect(mockGetItemById).not.toHaveBeenCalled();
  expect(mockInsertFeedback).not.toHaveBeenCalled();
});

it("rejects non-string feedback reasons", async () => {
  const response = await feedback(
    request("/api/ai/feedback", { itemId: "item-1", rating: 1, reason: { unsafe: true } })
  );

  expect(response.status).toBe(400);
  expect(mockGetItemById).not.toHaveBeenCalled();
});
