const mockInsertAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/database", () => ({
  insertAuditLog: (...args: unknown[]) => mockInsertAuditLog(...args),
}));

jest.mock("@/lib/middleware/trace", () => ({
  getTraceId: () => "trace-test",
}));

jest.mock("@/lib/logger", () => ({
  aiLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { AIProvider } from "../providers";
import { AIRouter } from "../router";

class ScriptedProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly calls: Array<{ operation: "text" | "json"; model: string }> = [];
  private readonly values: unknown[];

  constructor(...values: unknown[]) {
    this.values = values;
  }

  private next<T>(): T {
    const value = this.values.shift();
    if (value instanceof Error) throw value;
    return value as T;
  }

  async generateText(_prompt: string, model: string): Promise<string> {
    this.calls.push({ operation: "text", model });
    return this.next<string>();
  }

  async generateJSON<T>(_prompt: string, model: string): Promise<T> {
    this.calls.push({ operation: "json", model });
    return this.next<T>();
  }
}

describe("AIRouter task-scoped model fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DISTIL_DAILY_AI_BUDGET;
  });

  it("uses Flash-Lite once and reports the actual successful model", async () => {
    const provider = new ScriptedProvider({ overview: "accepted" });
    const router = new AIRouter(new Map([["gemini", provider]]));

    await expect(router.generateJSONWithMetadata("prompt", "summarize")).resolves.toEqual({
      value: { overview: "accepted" },
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
    });
    expect(provider.calls).toEqual([{ operation: "json", model: "gemini-3.5-flash-lite" }]);
    expect(mockInsertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.5-flash-lite", provider: "gemini" })
    );
  });

  it("moves immediately to 3.1 Flash-Lite after a primary quota failure", async () => {
    const provider = new ScriptedProvider(new Error("429 resource exhausted"), { ok: true });
    const router = new AIRouter(new Map([["gemini", provider]]));

    await expect(router.generateJSONWithMetadata("prompt", "summarize")).resolves.toEqual({
      value: { ok: true },
      provider: "gemini",
      model: "gemini-3.1-flash-lite",
    });
    expect(provider.calls.map((call) => call.model)).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ]);
    expect(mockInsertAuditLog).toHaveBeenCalledTimes(1);
    expect(mockInsertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.1-flash-lite" })
    );
  });

  it("returns a sanitized typed failure after both candidates exhaust quota", async () => {
    const provider = new ScriptedProvider(
      new Error("429 secret provider body"),
      new Error("quota")
    );
    const router = new AIRouter(new Map([["gemini", provider]]));

    await expect(router.generateJSON("prompt", "summarize")).rejects.toMatchObject({
      category: "quota",
      message: "AI provider quota exhausted",
    });
    expect(provider.calls).toHaveLength(2);
    expect(mockInsertAuditLog).not.toHaveBeenCalled();
  });

  it("does not apply summary fallback candidates to other tasks", async () => {
    const provider = new ScriptedProvider(new Error("429 quota"), { shouldNotRun: true });
    const router = new AIRouter(new Map([["gemini", provider]]));

    await expect(router.generateJSON("prompt", "auto-tag")).rejects.toMatchObject({
      category: "quota",
    });
    expect(provider.calls).toEqual([{ operation: "json", model: "gemini-3.5-flash-lite" }]);
  });
});
