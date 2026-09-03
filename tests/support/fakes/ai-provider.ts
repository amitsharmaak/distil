import type { AIProvider, GenerateOptions, GeminiProvider } from "@/lib/ai/providers";
import type { ProviderName } from "@/lib/ai/ai-config";

export interface FakeAICall {
  operation: "text" | "json" | "search";
  prompt: string;
  model?: string;
  options?: GenerateOptions;
}

type ScriptedResult = { type: "value"; value: unknown } | { type: "error"; error: Error };

function toScriptedResult(value: unknown | Error): ScriptedResult {
  return value instanceof Error ? { type: "error", error: value } : { type: "value", value };
}

/**
 * Scripted AI provider. Each operation consumes one queued result, making
 * timeouts, rate limits, malformed payloads, and recovery exactly repeatable.
 */
export class FakeAIProvider implements AIProvider, GeminiProvider {
  readonly calls: FakeAICall[] = [];
  private readonly textResults: ScriptedResult[] = [];
  private readonly jsonResults: ScriptedResult[] = [];
  private readonly searchResults: ScriptedResult[] = [];

  constructor(readonly name: ProviderName = "gemini") {}

  enqueueText(...results: Array<string | Error>): this {
    this.textResults.push(...results.map(toScriptedResult));
    return this;
  }

  enqueueJSON(...results: Array<unknown | Error>): this {
    this.jsonResults.push(...results.map(toScriptedResult));
    return this;
  }

  enqueueSearch(...results: Array<string | Error>): this {
    this.searchResults.push(...results.map(toScriptedResult));
    return this;
  }

  async generateText(prompt: string, model: string, options?: GenerateOptions): Promise<string> {
    this.calls.push({ operation: "text", prompt, model, options });
    return this.consume<string>(this.textResults, "text");
  }

  async generateJSON<T>(prompt: string, model: string, options?: GenerateOptions): Promise<T> {
    this.calls.push({ operation: "json", prompt, model, options });
    return this.consume<T>(this.jsonResults, "JSON");
  }

  async generateTextWithSearch(prompt: string): Promise<string> {
    this.calls.push({ operation: "search", prompt });
    return this.consume<string>(this.searchResults, "search");
  }

  reset(): void {
    this.calls.length = 0;
    this.textResults.length = 0;
    this.jsonResults.length = 0;
    this.searchResults.length = 0;
  }

  private consume<T>(queue: ScriptedResult[], operation: string): T {
    const result = queue.shift();
    if (!result) {
      throw new Error(`No fake AI ${operation} result was queued`);
    }
    if (result.type === "error") {
      throw result.error;
    }
    return result.value as T;
  }
}
