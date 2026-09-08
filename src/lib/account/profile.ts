import { z } from "zod";

import type { SettingsRepository } from "@/lib/repositories/ports";

const PROFILE_KEY = "account.profile.v1";

const privacySchema = z
  .object({
    allowPersonalization: z.boolean().default(true),
    allowAiProcessing: z.boolean().default(true),
  })
  .strict();

export const accountProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    timezone: z.string().trim().min(1).max(120).optional(),
    privacy: privacySchema.partial().optional(),
    onboardingCompleted: z.boolean().optional(),
  })
  .strict();

export type AccountProfileInput = z.infer<typeof accountProfileSchema>;

export class AccountProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountProfileValidationError";
  }
}

export interface AccountProfile {
  displayName?: string;
  timezone: string;
  privacy: z.infer<typeof privacySchema>;
  onboardingCompleted: boolean;
}

const defaults: AccountProfile = Object.freeze({
  timezone: "UTC",
  privacy: { allowPersonalization: true, allowAiProcessing: true },
  onboardingCompleted: false,
});

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function parseStoredProfile(value: string | undefined): AccountProfile {
  if (!value) return { ...defaults, privacy: { ...defaults.privacy } };
  const result = z
    .object({
      displayName: z.string().trim().min(1).max(120).optional(),
      timezone: z.string().trim().min(1).max(120).default("UTC"),
      privacy: privacySchema.default(defaults.privacy),
      onboardingCompleted: z.boolean().default(false),
    })
    .safeParse(JSON.parse(value));
  if (!result.success || !isValidTimezone(result.data.timezone)) {
    return { ...defaults, privacy: { ...defaults.privacy } };
  }
  return result.data;
}

export async function getAccountProfile(repository: SettingsRepository): Promise<AccountProfile> {
  const value = await repository.get(PROFILE_KEY);
  try {
    return parseStoredProfile(value);
  } catch {
    // A malformed legacy preference must not prevent account recovery. Storage
    // failures are intentionally not swallowed by this fallback.
    return { ...defaults, privacy: { ...defaults.privacy } };
  }
}

export async function updateAccountProfile(
  repository: SettingsRepository,
  input: AccountProfileInput
): Promise<AccountProfile> {
  const parsed = accountProfileSchema.parse(input);
  if (parsed.timezone && !isValidTimezone(parsed.timezone)) {
    throw new AccountProfileValidationError("Timezone must be a valid IANA timezone");
  }

  const current = await getAccountProfile(repository);
  const next: AccountProfile = {
    ...current,
    ...(parsed.displayName === undefined ? {} : { displayName: parsed.displayName }),
    ...(parsed.timezone === undefined ? {} : { timezone: parsed.timezone }),
    ...(parsed.onboardingCompleted === undefined
      ? {}
      : { onboardingCompleted: parsed.onboardingCompleted }),
    privacy: { ...current.privacy, ...parsed.privacy },
  };

  if (next.onboardingCompleted && (!next.displayName || !next.timezone)) {
    throw new AccountProfileValidationError(
      "A display name and timezone are required to complete onboarding"
    );
  }
  await repository.set(PROFILE_KEY, JSON.stringify(next));
  return next;
}
