/**
 * Deep research module.
 *
 * Conducts multi-step research using the AI router with Google Search grounding.
 * Features: parallel sub-questions (p-limit concurrency 3), granular progress
 * tracking, and iterative deepening (gap identification + second round).
 *
 * Research runs asynchronously — the caller gets a report ID immediately
 * and polls for completion.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import crypto from "crypto";
import {
  generateText,
  generateTextWithSearch,
  generateJSON,
  getEffectiveModel,
} from "./router";
import {
  researchPlanPrompt,
  researchSynthesizePrompt,
  researchGapsPrompt,
} from "./prompts";
import {
  insertResearchReport,
  updateResearchReport,
  getItemById,
} from "@/lib/db";

/** Progress payload stored in research_reports.progress as JSON. */
type ProgressPayload =
  | { stage: "planning" }
  | { stage: "researching"; current: number; total: number; question: string }
  | { stage: "deepening"; current: number; total: number; question: string }
  | { stage: "synthesizing" };

function setProgress(reportId: string, payload: ProgressPayload | null): void {
  updateResearchReport(reportId, {
    progress: payload ? JSON.stringify(payload) : null,
  });
}

/**
 * Start a deep research task. Creates a report row and kicks off
 * async research in the background.
 */
export function startResearch(query: string, itemId?: string): string {
  const reportId = crypto.randomUUID();

  let context: string | undefined;
  if (itemId) {
    const item = getItemById(itemId);
    if (item) {
      context = [item.title, item.summary, item.fullContent]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  const { model } = getEffectiveModel("research-plan");
  insertResearchReport({
    id: reportId,
    itemId,
    query,
    model,
  });

  runResearch(reportId, query, context).catch((error) => {
    console.error(`Research ${reportId} failed:`, error);
    updateResearchReport(reportId, {
      status: "failed",
      report: `Research failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      completedAt: new Date().toISOString(),
      progress: null,
    });
  });

  return reportId;
}

async function runResearch(
  reportId: string,
  query: string,
  context?: string,
): Promise<void> {
  updateResearchReport(reportId, { status: "running" });

  // p-limit is ESM-only; use dynamic import
  const pLimit = (await import("p-limit")).default;
  const limit = pLimit(3);

  // ── Planning ─────────────────────────────────────────────────────────────
  setProgress(reportId, { stage: "planning" });
  const planPrompt = researchPlanPrompt(query, context);
  const planText = await generateText(planPrompt, "research-plan");

  let subQuestions: string[];
  try {
    subQuestions = JSON.parse(planText) as string[];
  } catch {
    subQuestions = [query];
  }

  const allFindings: string[] = [];

  // ── First round: parallel research on sub-questions ───────────────────────
  let completedCount = 0;
  const researchQuestion = (question: string) =>
    limit(async () => {
      const result = await generateTextWithSearch(
        `Research this question thoroughly and provide detailed findings with source URLs:\n\n${question}`,
      );
      completedCount++;
      setProgress(reportId, {
        stage: "researching",
        current: completedCount,
        total: subQuestions.length,
        question,
      });
      return { question, findings: `## ${question}\n\n${result}` };
    });

  const round1Settled = await Promise.allSettled(
    subQuestions.map((q) => researchQuestion(q)),
  );

  for (const settled of round1Settled) {
    if (settled.status === "fulfilled") {
      allFindings.push(settled.value.findings);
    } else {
      const question =
        "question" in settled.reason
          ? String(settled.reason.question)
          : "Unknown";
      console.error(`Research sub-question failed: ${question}`, settled.reason);
      allFindings.push(`## ${question}\n\n(Research on this question failed.)`);
    }
  }

  let combinedFindings = allFindings.join("\n\n---\n\n");

  // ── Iterative deepening: identify gaps and do second round ──────────────────
  const gapsPrompt = researchGapsPrompt(query, combinedFindings);
  let gapsResult: { gaps: string[] };
  try {
    gapsResult = await generateJSON<{ gaps: string[] }>(
      gapsPrompt,
      "research-gaps",
    );
  } catch {
    gapsResult = { gaps: [] };
  }

  const gaps = Array.isArray(gapsResult?.gaps)
    ? gapsResult.gaps.filter((g): g is string => typeof g === "string").slice(0, 2)
    : [];

  if (gaps.length > 0) {
    let deepeningCompleted = 0;
    const deepenQuestion = (question: string) =>
      limit(async () => {
        const result = await generateTextWithSearch(
          `Research this specific gap/question concisely with source URLs:\n\n${question}`,
        );
        deepeningCompleted++;
        setProgress(reportId, {
          stage: "deepening",
          current: deepeningCompleted,
          total: gaps.length,
          question,
        });
        return `## ${question}\n\n${result}`;
      });

    const round2Settled = await Promise.allSettled(
      gaps.map((q) => deepenQuestion(q)),
    );

    const deepeningFindings: string[] = [];
    for (const settled of round2Settled) {
      if (settled.status === "fulfilled") {
        deepeningFindings.push(settled.value);
      } else {
        const question =
          "question" in settled.reason
            ? String(settled.reason.question)
            : "Unknown";
        console.error(`Deepening sub-question failed: ${question}`, settled.reason);
        deepeningFindings.push(`## ${question}\n\n(Research on this gap failed.)`);
      }
    }

    combinedFindings =
      combinedFindings +
      "\n\n---\n\n## Additional Deepening\n\n" +
      deepeningFindings.join("\n\n---\n\n");
  }

  // ── Synthesizing ──────────────────────────────────────────────────────────
  setProgress(reportId, { stage: "synthesizing" });
  const synthesizePrompt = researchSynthesizePrompt(query, combinedFindings);
  const report = await generateText(synthesizePrompt, "research-synthesize");

  const urlRegex = /https?:\/\/[^\s\)>\]"']+/g;
  const sources = [...new Set(combinedFindings.match(urlRegex) ?? [])];

  updateResearchReport(reportId, {
    report,
    sources: JSON.stringify(sources),
    status: "completed",
    completedAt: new Date().toISOString(),
    progress: null,
  });
}
