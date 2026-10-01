/**
 * Capture triage (backlog item "capture priority score and junk-page check").
 *
 * CONTRACT STUB: signatures are final; package A replaces the bodies.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import type { ResponseSchema } from "@google/generative-ai";

import type {
  CaptureTriage,
  CaptureTriageInput,
  CaptureTriageVerdict,
} from "@/lib/contracts/capture-triage";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";

export type TriageGenerate = (
  prompt: string,
  responseSchema: ResponseSchema
) => Promise<{ value: unknown; model: string }>;

/** One structured call; throws AIProviderError("invalid_output") on unusable output. */
export async function triageCapture(
  _input: CaptureTriageInput,
  _generate: TriageGenerate
): Promise<CaptureTriageVerdict> {
  throw new Error("triageCapture: not implemented (contract stub)");
}

/** Tenant-routed triage on task "triage-capture" (timeoutMs 8000, maxAttempts 1). */
export function createTenantCaptureTriage(
  _context: AuthContext,
  _repositories: RepositorySet
): CaptureTriage {
  return async () => {
    throw new Error("createTenantCaptureTriage: not implemented (contract stub)");
  };
}

export function triageInputFromText(_args: {
  url: string;
  title?: string;
  author?: string;
  publication?: string;
  text: string;
  preferenceSummary?: string;
}): CaptureTriageInput {
  throw new Error("triageInputFromText: not implemented (contract stub)");
}
