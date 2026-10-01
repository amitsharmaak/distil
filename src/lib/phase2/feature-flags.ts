/**
 * Server-only Phase 2 rollout controls. Features remain off unless explicitly
 * enabled, which lets an additive migration safely precede the experience.
 */
import type { CaptureTriageMode } from "@/lib/contracts/capture-triage";

export interface Phase2FeatureFlags {
  captureSummary: boolean;
  /** Per-capture life-area classification; `false` stops the extra AI call. */
  areaClassification: boolean;
  /** Capture triage: `"false"` turns it off, `"shadow"` scores without rejecting, else on. */
  captureTriage: CaptureTriageMode;
  /** Server-render `/` and `/feed` with their data; `false` restores the client-fetch pages. */
  serverRender: boolean;
  knowledgeUi: boolean;
  personalization: boolean;
  digests: boolean;
}

function readCaptureTriageMode(value: string | undefined): CaptureTriageMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "false") return "off";
  if (normalized === "shadow") return "shadow";
  return "on";
}

const enabled = (value: string | undefined): boolean => value?.trim().toLowerCase() === "true";

export function readPhase2FeatureFlags(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Phase2FeatureFlags {
  return Object.freeze({
    captureSummary: environment.FEATURE_CAPTURE_SUMMARY?.trim().toLowerCase() !== "false",
    areaClassification: environment.FEATURE_AREA_CLASSIFICATION?.trim().toLowerCase() !== "false",
    captureTriage: readCaptureTriageMode(environment.FEATURE_CAPTURE_TRIAGE),
    serverRender: environment.FEATURE_SERVER_RENDER?.trim().toLowerCase() !== "false",
    knowledgeUi: enabled(environment.FEATURE_KNOWLEDGE_UI),
    personalization: enabled(environment.FEATURE_PERSONALIZATION),
    digests: enabled(environment.FEATURE_DIGESTS),
  });
}
