/**
 * Preference learning module.
 *
 * Analyzes user feedback to build a preference profile that drives
 * personalized content prioritization.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { createTenantAIRouter } from "./router";
import { preferenceAnalysisPrompt } from "@/lib/prompts/prioritize";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { RepositorySet } from "@/lib/repositories/ports";
import type { UserPreferenceProfile, FeedbackWithItem } from "./types";

const PREFERENCES_KEY = "agent_preferences";
const CONFIG_KEY = "agent_config";

export async function getPreferences(repositories: RepositorySet): Promise<UserPreferenceProfile> {
  const raw = await repositories.settings.get(PREFERENCES_KEY);
  if (!raw) {
    return {
      topicWeights: {},
      sourceWeights: {},
      authorWeights: {},
      contentTypeWeights: {},
      recentFeedbackSummary: "",
      lastUpdated: new Date().toISOString(),
    };
  }
  return JSON.parse(raw) as UserPreferenceProfile;
}

async function savePreferences(
  repositories: RepositorySet,
  prefs: UserPreferenceProfile
): Promise<void> {
  await repositories.settings.set(PREFERENCES_KEY, JSON.stringify(prefs));
}

/**
 * Analyzes all feedback + item data and updates the preference profile.
 * Uses the fast preference-analysis model via the AI router.
 */
export async function updatePreferencesFromFeedback(
  context: AuthContext,
  repositories: RepositorySet
): Promise<UserPreferenceProfile> {
  const allFeedback = await repositories.feedback.list();

  if (allFeedback.length === 0) {
    return getPreferences(repositories);
  }

  const feedbackWithItems: FeedbackWithItem[] = [];
  for (const fb of allFeedback) {
    const item = await repositories.items.findById(fb.itemId);
    if (!item) continue;
    feedbackWithItems.push({
      feedbackId: fb.id,
      itemId: fb.itemId,
      rating: fb.rating,
      reason: fb.reason ?? null,
      feedbackDate: fb.createdAt,
      itemTitle: item.title,
      itemTopics: item.topics,
      itemSourceType: item.sourceType,
      itemContentType: item.contentType,
      itemAuthor: item.author,
    });
  }

  if (feedbackWithItems.length === 0) {
    return getPreferences(repositories);
  }

  const prompt = preferenceAnalysisPrompt(feedbackWithItems);
  const text = await createTenantAIRouter(context, repositories).generateText(
    prompt,
    "preference-analysis"
  );

  const parsed = JSON.parse(text) as Omit<UserPreferenceProfile, "lastUpdated">;

  const preferences: UserPreferenceProfile = {
    ...parsed,
    lastUpdated: new Date().toISOString(),
  };

  await savePreferences(repositories, preferences);
  return preferences;
}

export async function getAgentConfig(repositories: RepositorySet): Promise<string | undefined> {
  return repositories.settings.get(CONFIG_KEY);
}

export async function saveAgentConfig(
  repositories: RepositorySet,
  configJson: string
): Promise<void> {
  await repositories.settings.set(CONFIG_KEY, configJson);
}
