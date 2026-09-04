import { google } from "googleapis";

import { runGmailSenderDiscovery } from "@/lib/connectors/publishers/discovery/gmail-sender";
import { deleteOAuthToken, getOAuthToken, upsertOAuthToken } from "@/lib/database";
import { buildRawContent, processContent } from "@/lib/intelligence/pipeline";
import { connectorLogger } from "@/lib/logger";
import {
  disconnectGmail,
  getAuthUrl,
  getConnectedEmail,
  handleCallback,
  syncNewsletters,
} from "../gmail";

jest.mock("googleapis", () => ({
  google: { auth: { OAuth2: jest.fn() }, gmail: jest.fn() },
}));
jest.mock("@/lib/config", () => ({
  config: {
    googleClientId: "google-client",
    googleClientSecret: "google-secret",
    googleRedirectUri: "http://localhost/google/callback",
  },
}));
jest.mock("@/lib/database", () => ({
  getOAuthToken: jest.fn(),
  upsertOAuthToken: jest.fn(),
  deleteOAuthToken: jest.fn(),
}));
jest.mock("@/lib/intelligence/pipeline", () => ({
  buildRawContent: jest.fn((value) => ({ id: "raw", ...value })),
  processContent: jest.fn(),
}));
jest.mock("@/lib/connectors/publishers/discovery/gmail-sender", () => ({
  runGmailSenderDiscovery: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  connectorLogger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

const oauth = {
  generateAuthUrl: jest.fn(),
  getToken: jest.fn(),
  setCredentials: jest.fn(),
  revokeToken: jest.fn(),
  on: jest.fn(),
};

const gmail = {
  users: {
    getProfile: jest.fn(),
    messages: { list: jest.fn(), get: jest.fn() },
  },
};

const encoded = (value: string) => Buffer.from(value).toString("base64url");
const header = (name: string, value?: string) => ({ name, value });

describe("Gmail connector", () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeAll(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GMAIL_SYNC_AFTER_DATE;
    jest.mocked(google.auth.OAuth2).mockImplementation(() => oauth as never);
    jest.mocked(google.gmail).mockReturnValue(gmail as never);
    oauth.generateAuthUrl.mockReturnValue("https://accounts.example/authorize");
    oauth.getToken.mockResolvedValue({
      tokens: { access_token: "access", refresh_token: "refresh", expiry_date: 123 },
    });
    oauth.revokeToken.mockResolvedValue(undefined);
    gmail.users.getProfile.mockResolvedValue({ data: { emailAddress: "reader@example.com" } });
    jest.mocked(getOAuthToken).mockResolvedValue(undefined);
    jest.mocked(upsertOAuthToken).mockResolvedValue(undefined as never);
    jest.mocked(deleteOAuthToken).mockResolvedValue(undefined as never);
    jest.mocked(runGmailSenderDiscovery).mockResolvedValue(undefined as never);
    jest.mocked(processContent).mockResolvedValue({ rawContentId: "raw", status: "ready" });
  });

  it("builds the consent URL and persists complete callback credentials", async () => {
    expect(getAuthUrl()).toBe("https://accounts.example/authorize");
    expect(oauth.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    });

    await handleCallback("code");
    expect(oauth.getToken).toHaveBeenCalledWith("code");
    expect(oauth.setCredentials).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
      expiry_date: 123,
    });
    expect(upsertOAuthToken).toHaveBeenCalledWith("gmail", "", {
      access_token: "access",
      refresh_token: "refresh",
      expiry_date: 123,
      email: "reader@example.com",
    });
  });

  it("stores nullable callback fields and reports connected state", async () => {
    oauth.getToken.mockResolvedValueOnce({ tokens: { access_token: "access" } });
    gmail.users.getProfile.mockResolvedValueOnce({ data: {} });
    await handleCallback("minimal");
    expect(upsertOAuthToken).toHaveBeenLastCalledWith(
      "gmail",
      "",
      expect.objectContaining({ refresh_token: null, expiry_date: null, email: null })
    );

    jest.mocked(getOAuthToken).mockResolvedValueOnce({ email: "reader@example.com" } as never);
    await expect(getConnectedEmail()).resolves.toBe("reader@example.com");
    jest.mocked(getOAuthToken).mockResolvedValueOnce(undefined);
    await expect(getConnectedEmail()).resolves.toBeNull();
  });

  it("disconnects locally with absent, successfully revoked, and failed remote tokens", async () => {
    jest
      .mocked(getOAuthToken)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ access_token: "one" } as never)
      .mockResolvedValueOnce({ access_token: "two" } as never);
    await disconnectGmail();
    await disconnectGmail();
    oauth.revokeToken.mockRejectedValueOnce(new Error("already revoked"));
    await disconnectGmail();
    expect(deleteOAuthToken).toHaveBeenCalledTimes(3);
    expect(oauth.revokeToken).toHaveBeenCalledWith("one");
    expect(oauth.revokeToken).toHaveBeenCalledWith("two");
  });

  it("requires a connection before syncing", async () => {
    await expect(syncNewsletters()).rejects.toThrow("Gmail not connected");
  });

  it("paginates, triages, decodes MIME content, and isolates per-message failures", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    process.env.GMAIL_SYNC_AFTER_DATE = "2026/04/09";
    jest.mocked(getOAuthToken).mockResolvedValue({
      access_token: "access",
      refresh_token: "old-refresh",
      expiry_date: 100,
      email: "reader@example.com",
    } as never);

    let refreshHandler: ((tokens: Record<string, unknown>) => void) | undefined;
    oauth.on.mockImplementation((event, handler) => {
      if (event === "tokens") refreshHandler = handler;
      return oauth;
    });
    gmail.users.messages.list
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: "social" }, { id: undefined }, { id: "updates" }, { id: "list" }],
          nextPageToken: "next",
        },
      })
      .mockResolvedValueOnce({ data: { messages: [{ id: "broken" }] } });

    const metadata = new Map<string, unknown>([
      ["social", { data: { labelIds: ["CATEGORY_SOCIAL"], payload: {} } }],
      ["updates", { data: { labelIds: ["CATEGORY_UPDATES"], payload: { headers: [] } } }],
      [
        "list",
        {
          data: {
            payload: { headers: [header("List-Unsubscribe", "<mailto:leave@example.com>")] },
          },
        },
      ],
    ]);
    const updatesMessage = {
      id: "updates",
      internalDate: "1775822400000",
      labelIds: ["CATEGORY_UPDATES"],
      payload: {
        headers: [
          header("Subject", " Daily Brief "),
          header("From", '"Editor" <news@example.com>'),
          header("To", "reader@example.com"),
          header("Date", "Fri, 10 Apr 2026 12:00:00 GMT"),
          header("List-Unsubscribe", "<mailto:leave@example.com>"),
          header("List-Id", "brief.example.com"),
          header("Precedence", "bulk"),
          header("Auto-Submitted", "auto-generated"),
        ],
        parts: [
          { mimeType: "text/plain", body: { data: encoded("Plain body") } },
          {
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "text/html",
                body: {
                  data: encoded(
                    '<style>x</style><script>bad()</script><p>Hello &amp; world</p><a href="https://example.com/web">View in browser</a>'
                  ),
                },
              },
            ],
          },
        ],
      },
    };
    const listMessage = {
      id: "list",
      payload: {
        headers: [
          header("Subject", "List mail"),
          header("From", "author@newsletter.test"),
          header("Date", "Thu, 09 Apr 2026 09:00:00 GMT"),
        ],
        parts: [
          {
            mimeType: "text/html",
            body: {
              data: encoded('<p>Only HTML</p><a href="https://fallback.test/story">Read</a>'),
            },
          },
        ],
      },
    };
    gmail.users.messages.get.mockImplementation(async ({ id, format }) => {
      if (id === "broken") throw new Error("message disappeared");
      if (format === "metadata") return metadata.get(id) ?? { data: {} };
      return { data: id === "updates" ? updatesMessage : listMessage };
    });
    jest
      .mocked(processContent)
      .mockResolvedValueOnce({ rawContentId: "one", status: "ready" })
      .mockResolvedValueOnce({ rawContentId: "two", status: "rejected" });
    jest
      .mocked(runGmailSenderDiscovery)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error("discovery failed"));

    await expect(syncNewsletters()).resolves.toMatchObject({
      count: 1,
      items: [{ status: "ready" }, { status: "rejected" }],
    });
    expect(gmail.users.messages.list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ q: "after:2026/04/09", pageToken: undefined })
    );
    expect(gmail.users.messages.get).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "social", format: "full" })
    );
    expect(buildRawContent).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "gmail",
        url: "https://example.com/web",
        metadata: expect.objectContaining({ senderDomain: "example.com" }),
      })
    );
    expect(buildRawContent).toHaveBeenCalledWith(
      expect.objectContaining({
        rawTextContent: "Only HTML Read",
        url: "https://fallback.test/story",
      })
    );
    expect(connectorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msgId: "list" }),
      expect.stringContaining("publisher discovery failed")
    );

    refreshHandler?.({ access_token: "new-access" });
    refreshHandler?.({ refresh_token: "ignored-without-access" });
    await Promise.resolve();
    expect(upsertOAuthToken).toHaveBeenCalledWith(
      "gmail",
      "",
      expect.objectContaining({
        access_token: "new-access",
        refresh_token: "old-refresh",
        expiry_date: 100,
      })
    );
    jest.mocked(upsertOAuthToken).mockRejectedValueOnce(new Error("database unavailable"));
    refreshHandler?.({ access_token: "another-access", refresh_token: "new-refresh" });
    await Promise.resolve();
    await Promise.resolve();
    expect(connectorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "[gmail] failed to persist refreshed token"
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[gmail] Failed to process message broken:",
      expect.any(Error)
    );
    jest.useRealTimers();
  });

  it("handles an empty mailbox and the default two-day lookback", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    jest.mocked(getOAuthToken).mockResolvedValue({ access_token: "access" } as never);
    gmail.users.messages.list.mockResolvedValue({ data: {} });
    await expect(syncNewsletters()).resolves.toEqual({ count: 0, items: [] });
    expect(gmail.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: "after:2026/04/08" })
    );
    jest.useRealTimers();
  });
});
