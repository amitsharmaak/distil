jest.mock("@/lib/config", () => ({
  config: {
    syncIntervalHours: 3,
  },
}));

jest.mock("@/lib/logger", () => ({
  connectorLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const getOAuthTokensByProvider = jest.fn();
const getUserSetting = jest.fn();
const setUserSetting = jest.fn();

jest.mock("@/lib/db", () => ({
  getOAuthTokensByProvider,
  getUserSetting,
  setUserSetting,
}));

const syncNewsletters = jest.fn();
jest.mock("@/lib/connectors/gmail", () => ({ syncNewsletters }));

const syncSlackMessages = jest.fn();
jest.mock("@/lib/connectors/slack", () => ({ syncSlackMessages }));

jest.mock("@/lib/connectors/publishers/registry", () => ({ PUBLISHERS: [] }));
jest.mock("@/lib/connectors/publishers/session", () => ({
  getStatus: jest.fn().mockResolvedValue({ state: "disconnected" }),
}));
jest.mock("@/lib/connectors/publishers/worker", () => ({
  syncAllPublishers: jest.fn().mockResolvedValue({}),
}));

import { config } from "@/lib/config";
import { connectorLogger } from "@/lib/logger";
import { startSyncScheduler } from "../sync-scheduler";

describe("sync-scheduler", () => {
  const NOW = 1_000_000_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW });
    (config as { syncIntervalHours: number }).syncIntervalHours = 3;
    // The scheduler's singleton guard lives on globalThis — clear it so each
    // test can call startSyncScheduler() as if starting fresh.
    delete (globalThis as { __distilSchedulerStarted?: boolean }).__distilSchedulerStarted;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not sync Gmail or Slack when no oauth tokens are connected", async () => {
    getOAuthTokensByProvider.mockReturnValue([]);

    startSyncScheduler();
    await jest.advanceTimersByTimeAsync(0);

    expect(syncNewsletters).not.toHaveBeenCalled();
    expect(syncSlackMessages).not.toHaveBeenCalled();
    expect(setUserSetting).not.toHaveBeenCalled();
  });

  it("syncs Gmail and Slack when connected and last sync is stale, and records the timestamp", async () => {
    getOAuthTokensByProvider.mockImplementation((provider: string) =>
      provider === "gmail" || provider === "slack" ? [{ id: 1 }] : []
    );
    getUserSetting.mockReturnValue(null); // never synced -> stale
    syncNewsletters.mockResolvedValue({ count: 2 });
    syncSlackMessages.mockResolvedValue({ count: 5 });

    startSyncScheduler();
    await jest.advanceTimersByTimeAsync(0);

    expect(syncNewsletters).toHaveBeenCalledTimes(1);
    expect(syncSlackMessages).toHaveBeenCalledTimes(1);
    expect(setUserSetting).toHaveBeenCalledWith("gmail_last_scheduled_sync", String(NOW));
    expect(setUserSetting).toHaveBeenCalledWith("slack_last_scheduled_sync", String(NOW));
  });

  it("does not sync when connected but the last sync was recent", async () => {
    getOAuthTokensByProvider.mockImplementation((provider: string) =>
      provider === "gmail" || provider === "slack" ? [{ id: 1 }] : []
    );
    // Last sync 1 minute ago — well within the 3-hour interval.
    getUserSetting.mockReturnValue(String(NOW - 60_000));

    startSyncScheduler();
    await jest.advanceTimersByTimeAsync(0);

    expect(syncNewsletters).not.toHaveBeenCalled();
    expect(syncSlackMessages).not.toHaveBeenCalled();
    expect(setUserSetting).not.toHaveBeenCalled();
  });

  it("does nothing and logs when SYNC_INTERVAL_HOURS is 0", async () => {
    (config as { syncIntervalHours: number }).syncIntervalHours = 0;

    startSyncScheduler();

    expect(connectorLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Auto-sync disabled")
    );
    expect(getOAuthTokensByProvider).not.toHaveBeenCalled();
  });

  it("is a no-op when called a second time (singleton guard)", async () => {
    getOAuthTokensByProvider.mockReturnValue([]);

    startSyncScheduler();
    startSyncScheduler();
    await jest.advanceTimersByTimeAsync(0);

    // Only one scheduler should have logged startup.
    const startupCalls = (connectorLogger.info as jest.Mock).mock.calls.filter(
      (call) => call[1] === "Starting background sync scheduler"
    );
    expect(startupCalls).toHaveLength(1);
  });

  it("continues to Slack even when Gmail sync throws", async () => {
    getOAuthTokensByProvider.mockImplementation((provider: string) =>
      provider === "gmail" || provider === "slack" ? [{ id: 1 }] : []
    );
    getUserSetting.mockReturnValue(null);
    syncNewsletters.mockRejectedValue(new Error("gmail boom"));
    syncSlackMessages.mockResolvedValue({ count: 1 });

    startSyncScheduler();
    await jest.advanceTimersByTimeAsync(0);

    expect(setUserSetting).not.toHaveBeenCalledWith(
      "gmail_last_scheduled_sync",
      expect.any(String)
    );
    expect(setUserSetting).toHaveBeenCalledWith("slack_last_scheduled_sync", String(NOW));
  });
});
