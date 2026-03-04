/**
 * Deep research module.
 *
 * Conducts multi-step research using Gemini with Google Search grounding.
 * Research runs asynchronously — the caller gets a report ID immediately
 * and polls for completion.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import crypto from "crypto";
import { generateText, generateTextWithSearch, DEFAULT_MODEL } from "./client";
import { researchPlanPrompt, researchSynthesizePrompt } from "./prompts";
import {
  insertResearchReport,
  updateResearchReport,
  getItemById,
} from "@/lib/db";

/**
 * Start a deep research task. Creates a report row and kicks off
 * async research in the background.
 *
 * @returns The report ID for polling.
 */
export function startResearch(query: string, itemId?: string): string {
  const reportId = crypto.randomUUID();

  // Get context from source item if provided.
  let context: string | undefined;
  if (itemId) {
    const item = getItemById(itemId);
    if (item) {
      context = [item.title, item.summary, item.fullContent].filter(Boolean).join("\n\n");
    }
  }

  // Create the report row.
  insertResearchReport({
    id: reportId,
    itemId,
    query,
    model: DEFAULT_MODEL,
  });

  // Kick off research asynchronously (fire-and-forget).
  runResearch(reportId, query, context).catch((error) => {
    console.error(`Research ${reportId} failed:`, error);
    updateResearchReport(reportId, {
      status: "failed",
      report: `Research failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      completedAt: new Date().toISOString(),
    });
  });

  return reportId;
}

/**
 * The actual research flow. Updates the report row as it progresses.
 */
async function runResearch(
  reportId: string,
  query: string,
  context?: string,
): Promise<void> {
  // Mark as running.
  updateResearchReport(reportId, { status: "running" });

  // Step 1: Plan — get research sub-questions.
  const planPrompt = researchPlanPrompt(query, context);
  const planText = await generateText(planPrompt);

  let subQuestions: string[];
  try {
    subQuestions = JSON.parse(planText) as string[];
  } catch {
    subQuestions = [query]; // Fallback to the original query
  }

  // Step 2: Research each sub-question using Google Search grounding.
  const allFindings: string[] = [];

  for (const question of subQuestions) {
    try {
      const findings = await generateTextWithSearch(
        `Research this question thoroughly and provide detailed findings with source URLs:\n\n${question}`,
      );
      allFindings.push(`## ${question}\n\n${findings}`);
    } catch (error) {
      console.error(`Research sub-question failed: ${question}`, error);
      allFindings.push(`## ${question}\n\n(Research on this question failed.)`);
    }
  }

  // Step 3: Synthesize all findings into a final report.
  const combinedFindings = allFindings.join("\n\n---\n\n");
  const synthesizePrompt = researchSynthesizePrompt(query, combinedFindings);
  const report = await generateText(synthesizePrompt);

  // Extract any URLs from the findings as sources.
  const urlRegex = /https?:\/\/[^\s\)>\]"']+/g;
  const sources = [...new Set(combinedFindings.match(urlRegex) ?? [])];

  // Save final report.
  updateResearchReport(reportId, {
    report,
    sources: JSON.stringify(sources),
    status: "completed",
    completedAt: new Date().toISOString(),
  });
}
