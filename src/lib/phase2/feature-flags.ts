/**
 * Server-only Phase 2 rollout controls. Features remain off unless explicitly
 * enabled, which lets an additive migration safely precede the experience.
 */
export interface Phase2FeatureFlags {
  knowledgeUi: boolean;
  search: boolean;
  answers: boolean;
  personalization: boolean;
  digests: boolean;
}

const enabled = (value: string | undefined): boolean => value?.trim().toLowerCase() === "true";

export function readPhase2FeatureFlags(
  environment: Readonly<Record<string, string | undefined>> = process.env
): Phase2FeatureFlags {
  return Object.freeze({
    knowledgeUi: enabled(environment.FEATURE_KNOWLEDGE_UI),
    search: enabled(environment.FEATURE_SEARCH),
    answers: enabled(environment.FEATURE_ANSWERS),
    personalization: enabled(environment.FEATURE_PERSONALIZATION),
    digests: enabled(environment.FEATURE_DIGESTS),
  });
}
