import { WebClient } from "@slack/web-api";

import { config } from "@/lib/config";
import {
  deleteOAuthToken,
  getOAuthToken,
  getOAuthTokensByProvider,
  getUserSetting,
  setUserSetting,
  upsertOAuthToken,
} from "@/lib/database";
import { buildRawContent, processContent } from "@/lib/intelligence/pipeline";
import { connectorLogger } from "@/lib/logger";
import {
  disconnectSlack,
  getAllSlackStatuses,
  getAuthUrl,
  getSlackStatus,
  handleCallback,
  isSlackConfigured,
  syncSlackMessages,
} from "../slack";

jest.mock("@slack/web-api", () => ({ WebClient: jest.fn() }));
jest.mock("@/lib/config", () => ({
  config: {
    slackClientId: "slack-client",
    slackClientSecret: "slack-secret",
    slackRedirectUri: "http://localhost/slack/callback",
    slackChannels: ["general"],
  },
}));
jest.mock("@/lib/database", () => ({
  getOAuthToken: jest.fn(),
  getOAuthTokensByProvider: jest.fn(),
  upsertOAuthToken: jest.fn(),
  deleteOAuthToken: jest.fn(),
  getUserSetting: jest.fn(),
  setUserSetting: jest.fn(),
}));
jest.mock("@/lib/intelligence/pipeline", () => ({
  buildRawContent: jest.fn((value) => ({ id: "raw", ...value })),
  processContent: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  connectorLogger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

type MutableConfig = {
  slackClientId: string;
  slackClientSecret: string;
  slackRedirectUri: string;
  slackChannels: string[];
};

function clientFixture() {
  return {
    auth: { revoke: jest.fn(), test: jest.fn() },
    users: { conversations: jest.fn(), info: jest.fn() },
    conversations: { history: jest.fn(), info: jest.fn(), members: jest.fn() },
  };
}

const token = (teamId = "T1", accessToken = "xoxp-one") => ({
  provider: "slack",
  team_id: teamId,
  access_token: accessToken,
  refresh_token: null,
  expiry_date: null,
  email: null,
  updated_at: "2026-04-01T00:00:00.000Z",
});

describe("Slack connector", () => {
  const mutableConfig = config as unknown as MutableConfig;
  const clients = new Map<string, ReturnType<typeof clientFixture>>();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    clients.clear();
    mutableConfig.slackClientId = "slack-client";
    mutableConfig.slackClientSecret = "slack-secret";
    mutableConfig.slackRedirectUri = "http://localhost/slack/callback";
    mutableConfig.slackChannels = ["general"];
    jest.mocked(WebClient).mockImplementation((accessToken) => {
      const key = String(accessToken ?? "");
      const client = clients.get(key) ?? clientFixture();
      clients.set(key, client);
      return client as never;
    });
    jest.mocked(getOAuthToken).mockResolvedValue(undefined);
    jest.mocked(getOAuthTokensByProvider).mockResolvedValue([]);
    jest.mocked(getUserSetting).mockResolvedValue(undefined);
    jest.mocked(setUserSetting).mockResolvedValue(undefined as never);
    jest.mocked(upsertOAuthToken).mockResolvedValue(undefined as never);
    jest.mocked(deleteOAuthToken).mockResolvedValue(undefined as never);
    jest.mocked(processContent).mockResolvedValue({ rawContentId: "raw", status: "ready" });
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("builds authorization URLs with optional state and rejects missing configuration", () => {
    const withoutState = new URL(getAuthUrl());
    expect(withoutState.searchParams.get("client_id")).toBe("slack-client");
    expect(withoutState.searchParams.get("scope")).toBeNull();
    expect(withoutState.searchParams.get("user_scope")).toContain("channels:history");
    expect(new URL(getAuthUrl("csrf-state")).searchParams.get("state")).toBe("csrf-state");

    mutableConfig.slackClientId = "";
    expect(() => getAuthUrl()).toThrow("SLACK_CLIENT_ID is not configured");
  });

  it("validates OAuth configuration and provider responses", async () => {
    mutableConfig.slackClientSecret = "";
    await expect(handleCallback("code")).rejects.toThrow("credentials are not configured");
    mutableConfig.slackClientSecret = "slack-secret";

    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "bad_code" })));
    await expect(handleCallback("bad")).rejects.toThrow("bad_code");
    jest.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    await expect(handleCallback("missing-token")).rejects.toThrow("unknown");
  });

  it.each([
    [{ id: "T1", name: "Workspace" }, { id: "U1", access_token: "xoxp-1" }, "Workspace:U1"],
    [{ id: "T2", name: "Workspace" }, { access_token: "xoxp-2" }, "Workspace"],
    [{ id: "T3" }, { id: "U3", access_token: "xoxp-3" }, "U3"],
    [undefined, { access_token: "xoxp-4" }, null],
  ])("persists OAuth identity variants", async (team, authedUser, identity) => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, team, authed_user: authedUser }))
      );
    await handleCallback("good");
    expect(upsertOAuthToken).toHaveBeenCalledWith(
      "slack",
      team?.id ?? "",
      expect.objectContaining({ access_token: authedUser.access_token, email: identity })
    );
    expect(setUserSetting).toHaveBeenCalledWith(
      team?.id ? `slack_last_sync_${team.id}` : "slack_last_sync",
      "0"
    );
  });

  it("reports configured state and disconnects locally despite revocation failures", async () => {
    jest
      .mocked(getOAuthTokensByProvider)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token()] as never);
    await expect(isSlackConfigured()).resolves.toBe(false);
    await expect(isSlackConfigured()).resolves.toBe(true);

    jest
      .mocked(getOAuthToken)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(token("T1", "ok") as never)
      .mockResolvedValueOnce(token("T2", "bad") as never);
    clients.set("ok", clientFixture());
    clients.get("ok")!.auth.revoke.mockResolvedValue(undefined);
    clients.set("bad", clientFixture());
    clients.get("bad")!.auth.revoke.mockRejectedValue(new Error("already revoked"));
    await disconnectSlack("missing");
    await disconnectSlack("T1");
    await disconnectSlack("T2");
    expect(deleteOAuthToken).toHaveBeenCalledTimes(3);
  });

  it("reports empty, connected, and unreachable workspace statuses", async () => {
    jest.mocked(getOAuthTokensByProvider).mockResolvedValueOnce([]);
    await expect(getAllSlackStatuses()).resolves.toEqual([]);
    await expect(getSlackStatus()).resolves.toEqual({
      connected: false,
      teamName: null,
      userName: null,
    });

    const connected = token("T1", "connected");
    const unreachable = token("", "unreachable");
    jest.mocked(getOAuthTokensByProvider).mockResolvedValue([connected, unreachable] as never);
    jest
      .mocked(getUserSetting)
      .mockResolvedValueOnce("1770000000")
      .mockResolvedValueOnce("0")
      .mockResolvedValueOnce("1770000000")
      .mockResolvedValueOnce("0");
    clients.set("connected", clientFixture());
    clients.get("connected")!.auth.test.mockResolvedValue({ team: "Team", user: "Reader" });
    clients.set("unreachable", clientFixture());
    clients.get("unreachable")!.auth.test.mockRejectedValue(new Error("offline"));

    const statuses = await getAllSlackStatuses();
    expect(statuses).toEqual([
      expect.objectContaining({ connected: true, teamName: "Team", userName: "Reader" }),
      expect.objectContaining({ connected: false, lastSync: unreachable.updated_at }),
    ]);
    await expect(getSlackStatus()).resolves.toEqual({
      connected: true,
      teamName: "Team",
      userName: "Reader",
    });
  });

  it("requires at least one workspace before syncing", async () => {
    await expect(syncSlackMessages()).rejects.toThrow("Slack not connected");
  });

  it("enumerates conversation types but safely skips all content without an allowlist", async () => {
    mutableConfig.slackChannels = [];
    jest.mocked(getOAuthTokensByProvider).mockResolvedValue([token()] as never);
    const client = clientFixture();
    clients.set("xoxp-one", client);
    client.users.conversations.mockResolvedValue({
      channels: [
        { id: "public", name: "Public" },
        { id: "private", is_private: true },
        { id: "mpim", is_mpim: true },
        { id: "im", is_im: true },
        { name: "missing-id" },
      ],
      response_metadata: { next_cursor: "" },
    });

    await expect(syncSlackMessages()).resolves.toEqual({
      count: 0,
      items: [],
      stats: { channels: 0, messagesScanned: 0, messagesWithUrls: 0 },
    });
    expect(connectorLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "T1" }),
      expect.stringContaining("SLACK_CHANNELS not configured")
    );
  });

  it("paginates allowed conversations, extracts every URL source, and always advances the watermark", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    mutableConfig.slackChannels = ["general", "d1", "group"];
    jest.mocked(getOAuthTokensByProvider).mockResolvedValue([token()] as never);
    jest
      .mocked(getUserSetting)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(String(Math.floor(Date.now() / 1000) - 60));

    const client = clientFixture();
    clients.set("xoxp-one", client);
    client.users.conversations
      .mockResolvedValueOnce({
        channels: [
          { id: "C1", name: "General" },
          { id: "C2", name: "Secret", is_private: true },
          { id: "D1", is_im: true },
          { id: "group", is_mpim: true },
          { name: "missing-id" },
        ],
        response_metadata: { next_cursor: "next" },
      })
      .mockResolvedValueOnce({
        channels: [{ id: "C3", name: "Other" }],
        response_metadata: {},
      });
    client.conversations.info.mockImplementation(async ({ channel }) => {
      if (channel === "D1") return { channel: { is_im: true, user: "U1" } };
      if (channel === "group") return { channel: { is_mpim: true } };
      return {};
    });
    client.conversations.members.mockResolvedValue({ members: ["U1", "U2", "U3", "U4"] });
    client.users.info.mockImplementation(async ({ user }) => {
      if (user === "U1") return { user: { profile: { display_name: "Ada" } } };
      if (user === "U2") return { user: { real_name: "Grace" } };
      if (user === "U3") return { user: { name: "Linus" } };
      throw new Error("unknown user");
    });

    client.conversations.history.mockImplementation(async ({ channel, cursor }) => {
      if (channel === "D1") throw { data: { error: "not_allowed" } };
      if (channel === "group") return { messages: undefined, response_metadata: {} };
      if (cursor) return { messages: [], response_metadata: {} };
      return {
        messages: [
          { subtype: "message_changed" },
          { subtype: "message_deleted" },
          { text: "plain text", ts: "1775822400.000" },
          {
            text: "<https://example.com/a|A> <https://slack.com/internal> <https://example.com/a>",
            user: "U1",
            ts: "1775822400.000",
            attachments: [
              { original_url: "https://attach.test/story" },
              { from_url: "https://slack-redir.net/internal" },
              {},
            ],
            blocks: [
              { elements: [{ type: "link", url: "https://block.test/story" }, null, "text"] },
            ],
          },
        ],
        response_metadata: { next_cursor: "history-next" },
      };
    });
    jest
      .mocked(processContent)
      .mockResolvedValueOnce({ rawContentId: "one", status: "ready" })
      .mockRejectedValueOnce(new Error("pipeline failed"))
      .mockResolvedValueOnce({ rawContentId: "three", status: "rejected" });

    const result = await syncSlackMessages();
    expect(result).toMatchObject({
      count: 1,
      items: [{ status: "ready" }, { status: "rejected" }],
      stats: { channels: 3, messagesScanned: 2, messagesWithUrls: 1 },
    });
    expect(buildRawContent).toHaveBeenCalledTimes(3);
    expect(buildRawContent).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/a",
        metadata: expect.objectContaining({ channelName: "General", authorName: "Ada" }),
      })
    );
    expect(client.users.info).toHaveBeenCalledWith({ user: "U1" });
    expect(setUserSetting).toHaveBeenCalledWith(
      "slack_last_sync_T1",
      String(Math.floor(Date.now() / 1000))
    );
    expect(connectorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: "not_allowed" }),
      "Failed to read Slack conversation"
    );
    expect(connectorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Failed to process Slack URL"
    );
    jest.useRealTimers();
  });
});
