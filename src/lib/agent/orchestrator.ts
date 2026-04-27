/**
 * Agent orchestrator — manages tool-calling loops with LLM.
 * SERVER-SIDE ONLY.
 */

import { generateText } from "@/lib/ai/router";
import { aiLogger } from "@/lib/logger";
import { getTraceId } from "@/lib/middleware/trace";
import { getToolRegistry } from "./tool-registry";
import { registerAllTools } from "./register-tools";
import { insertApproval } from "@/lib/db";
import { filterPII } from "@/lib/pii-filter";

// Caps runaway loops where the LLM keeps calling tools without converging.
const MAX_ITERATIONS = 10;
// Limits how many tools the LLM can invoke in a single response turn.
// Keeps individual turns fast and prevents runaway parallel tool execution.
const MAX_TOOL_CALLS_PER_TURN = 3;

const SYSTEM_PROMPT = `You are Distil, a personal information assistant. Your goal is to help the user stay informed without being overwhelmed. You triage incoming content, surface what matters, and answer questions about the user's knowledge base.

Rules:
- Never fabricate information. If unsure, say "I don't have enough information."
- Always cite sources with item IDs when referencing saved content.
- Never delete items or modify content without explicit user approval.
- Respect user preferences. If they've downvoted a topic, deprioritize it.
- Be concise. The user is busy.

When you need to use a tool, respond with a JSON block:
\`\`\`tool_call
{"tool": "tool_name", "params": {"key": "value"}}
\`\`\`

Tool calls are wrapped in markdown fences (not a native function-calling API) so
the same format works uniformly across Gemini, OpenAI, and Anthropic providers.

You may make up to ${MAX_TOOL_CALLS_PER_TURN} tool calls per turn. After receiving tool results, synthesize a final answer.

Available tools:
{TOOL_DESCRIPTIONS}`;

export interface OrchestratorResult {
  response: string;
  toolCalls: Array<{
    tool: string;
    params: Record<string, unknown>;
    result: unknown;
  }>;
  pendingApprovals: string[];
  iterations: number;
}

/**
 * Run the agent orchestrator for a given user message.
 */
export async function runAgent(
  userMessage: string,
  context?: { workflowId?: string; conversationHistory?: string[] },
): Promise<OrchestratorResult> {
  registerAllTools();
  const registry = getToolRegistry();
  const traceId = getTraceId();
  const toolDescriptions = JSON.stringify(
    registry.getToolDescriptions(),
    null,
    2,
  );

  const systemPrompt = SYSTEM_PROMPT.replace(
    "{TOOL_DESCRIPTIONS}",
    toolDescriptions,
  );
  const { filtered: filteredMessage } = filterPII(userMessage);

  let conversationContext = "";
  if (context?.conversationHistory?.length) {
    conversationContext = context.conversationHistory.join("\n") + "\n";
  }

  const toolCalls: OrchestratorResult["toolCalls"] = [];
  const pendingApprovals: string[] = [];
  let currentPrompt = `${systemPrompt}\n\n${conversationContext}User: ${filteredMessage}`;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await generateText(currentPrompt, "research-plan");

    // Check for tool calls in response
    const toolCallMatches = response.match(/```tool_call\n([\s\S]*?)```/g);

    if (!toolCallMatches || toolCallMatches.length === 0) {
      // No tool calls — this is the final response
      return { response, toolCalls, pendingApprovals, iterations };
    }

    // Parse and execute tool calls
    let toolResults = "";
    let callsThisTurn = 0;

    for (const match of toolCallMatches) {
      if (callsThisTurn >= MAX_TOOL_CALLS_PER_TURN) break;

      try {
        const json = match
          .replace(/```tool_call\n/, "")
          .replace(/```$/, "")
          .trim();
        const { tool, params } = JSON.parse(json) as {
          tool: string;
          params: Record<string, unknown>;
        };

        const { result, requiresApproval } = await registry.execute(
          tool,
          params ?? {},
          {
            workflowId: context?.workflowId,
            reasoning: `User asked: ${filteredMessage.slice(0, 100)}`,
          },
        );

        if (requiresApproval) {
          const approvalId = crypto.randomUUID();
          insertApproval({
            id: approvalId,
            workflowId: context?.workflowId,
            actionType: tool,
            description: `Agent wants to ${tool} with params: ${JSON.stringify(params)}`,
            payload: JSON.stringify({ tool, params }),
            traceId,
          });
          pendingApprovals.push(approvalId);
          toolResults += `\nTool ${tool}: Requires user approval (queued as ${approvalId})`;
        } else {
          const resultStr =
            typeof result === "string" ? result : JSON.stringify(result);
          toolCalls.push({ tool, params, result });
          toolResults += `\nTool ${tool} result: ${resultStr.slice(0, 2000)}`;
        }
        callsThisTurn++;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        toolResults += `\nTool error: ${errMsg}`;
        aiLogger.error(
          { traceId, err: error },
          "Tool call failed in orchestrator",
        );
      }
    }

    // Continue the conversation with tool results
    currentPrompt += `\n\nAssistant: ${response}\n\nTool Results:${toolResults}\n\nBased on the tool results above, provide your response to the user:`;
  }

  return {
    response:
      "I've reached the maximum number of processing steps. Here's what I found so far based on the tools I've used.",
    toolCalls,
    pendingApprovals,
    iterations,
  };
}
