import { getAccountProfile, updateAccountProfile } from "../profile";

const repository = () => ({
  get: jest.fn(),
  set: jest.fn(),
});

describe("account profile", () => {
  it("falls back safely when stored profile data is malformed", async () => {
    const settings = repository();
    settings.get.mockResolvedValue("not-json");
    await expect(getAccountProfile(settings)).resolves.toEqual({
      timezone: "UTC",
      privacy: { allowPersonalization: true, allowAiProcessing: true },
      onboardingCompleted: false,
    });
  });

  it("persists tenant-owned profile and privacy fields without accepting invalid timezones", async () => {
    const settings = repository();
    settings.get.mockResolvedValue(undefined);
    await expect(
      updateAccountProfile(settings, {
        displayName: "Amit",
        timezone: "Asia/Kolkata",
        privacy: { allowAiProcessing: false },
        onboardingCompleted: true,
      })
    ).resolves.toEqual({
      displayName: "Amit",
      timezone: "Asia/Kolkata",
      privacy: { allowPersonalization: true, allowAiProcessing: false },
      onboardingCompleted: true,
    });
    expect(settings.set).toHaveBeenCalledWith("account.profile.v1", expect.any(String));

    await expect(updateAccountProfile(settings, { timezone: "Mars/Olympus" })).rejects.toThrow(
      "Timezone must be a valid IANA timezone"
    );
  });

  it("does not mark onboarding complete without a display name", async () => {
    const settings = repository();
    settings.get.mockResolvedValue(undefined);
    await expect(
      updateAccountProfile(settings, { timezone: "UTC", onboardingCompleted: true })
    ).rejects.toThrow("A display name and timezone are required");
  });
});
