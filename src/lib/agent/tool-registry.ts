/**
 * Agent tool registry — maps tool names to handlers with permission control.
 * SERVER-SIDE ONLY.
 */

import { aiLogger } from "@/lib/logger";
import { getTraceId } from "@/lib/middleware/trace";
import { insertAgentAction } from "@/lib/db";

export type ToolCategory =
  | "READ"
  | "WRITE-LOW"
  | "WRITE-MED"
  | "WRITE-HIGH"
  | "EXTERNAL";

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  rateLimit: number; // calls per minute
  requiresApproval: boolean;
  parameters: Record<
    string,
    { type: string; description: string; required?: boolean }
  >;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private callCounts = new Map<string, { count: number; resetAt: number }>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  /**
   * Execute a tool with permission checking, rate limiting, and audit logging.
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    context?: { workflowId?: string; reasoning?: string },
  ): Promise<{ result: unknown; requiresApproval: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    // Rate limit check
    this.checkRateLimit(name, tool.rateLimit);

    // If requires approval, don't execute — return flag
    if (tool.requiresApproval) {
      return { result: null, requiresApproval: true };
    }

    const start = Date.now();
    const traceId = getTraceId();

    try {
      const result = await tool.handler(params);
      const latency = Date.now() - start;

      // Log agent action
      insertAgentAction({
        id: crypto.randomUUID(),
        workflowId: context?.workflowId,
        actionType: "tool_call",
        toolName: name,
        input: JSON.stringify(params),
        output:
          typeof result === "string"
            ? result.slice(0, 1000)
            : JSON.stringify(result).slice(0, 1000),
        reasoning: context?.reasoning,
        traceId,
      });

      aiLogger.info(
        { traceId, tool: name, category: tool.category, latencyMs: latency },
        "Tool executed",
      );

      return { result, requiresApproval: false };
    } catch (error) {
      aiLogger.error({ traceId, tool: name, err: error }, "Tool execution failed");
      throw error;
    }
  }

  private checkRateLimit(name: string, limit: number): void {
    const now = Date.now();
    let bucket = this.callCounts.get(name);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60_000 };
      this.callCounts.set(name, bucket);
    }
    if (bucket.count >= limit) {
      throw new Error(`Rate limit exceeded for tool ${name}: ${limit}/min`);
    }
    bucket.count++;
  }

  /**
   * Returns tool definitions formatted for LLM function calling.
   */
  getToolDescriptions(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}

// Singleton
const registry = new ToolRegistry();

export function getToolRegistry(): ToolRegistry {
  return registry;
}

export { ToolRegistry };
