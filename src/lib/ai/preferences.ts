/**
 * Preference learning module.
 *
 * Analyzes user feedback to build a preference profile that drives
 * personalized content prioritization.
 *
 * SERVER-SIDE ONLY — never import from "use client" components.
 */

import { generateText } from "./router";
import { preferenceAnalysisPrompt } from "@/lib/prompts/prioritize";
import { getAllFeedback, getItemById, getUserSetting, setUserSetting } from "@/lib/db";
import type { UserPreferenceProfile, FeedbackWithItem } from "./types";

const PREFERENCES_KEY = "agent_preferences";
const CONFIG_KEY = "agent_config";

export async function getPreferences(): Promise<UserPreferenceProfile> {
  const raw = await getUserSetting(PREFERENCES_KEY);
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

async function savePreferences(prefs: UserPreferenceProfile): Promise<void> {
  await setUserSetting(PREFERENCES_KEY, JSON.stringify(prefs));
}

/**
 * Analyzes all feedback + item data and updates the preference profile.
 * Uses the fast preference-analysis model via the AI router.
 */
export async function updatePreferencesFromFeedback(): Promise<UserPreferenceProfile> {
  const allFeedback = await getAllFeedback();

  if (allFeedback.length === 0) {
    return await getPreferences();
  }

  const feedbackWithItems: FeedbackWithItem[] = [];
  for (const fb of allFeedback) {
    const item = await getItemById(fb.item_id);
    if (!item) continue;
    feedbackWithItems.push({
      feedbackId: fb.id,
      itemId: fb.item_id,
      rating: fb.rating,
      reason: fb.reason,
      feedbackDate: fb.created_at,
      itemTitle: item.title,
      itemTopics: item.topics,
      itemSourceType: item.sourceType,
      itemContentType: item.contentType,
      itemAuthor: item.author,
    });
  }

  if (feedbackWithItems.length === 0) {
    return await getPreferences();
  }

  const prompt = preferenceAnalysisPrompt(feedbackWithItems);
  const text = await generateText(prompt, "preference-analysis");

  const parsed = JSON.parse(text) as Omit<UserPreferenceProfile, "lastUpdated">;

  const preferences: UserPreferenceProfile = {
    ...parsed,
    lastUpdated: new Date().toISOString(),
  };

  await savePreferences(preferences);
  return preferences;
}

export async function getAgentConfig(): Promise<string | undefined> {
  return await getUserSetting(CONFIG_KEY);
}

export async function saveAgentConfig(configJson: string): Promise<void> {
  await setUserSetting(CONFIG_KEY, configJson);
}
