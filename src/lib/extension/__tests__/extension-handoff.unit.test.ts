import { describeBrowser } from "@/lib/extension/browser-label";
import {
  DISTIL_EXTENSION_ID,
  DISTIL_EXTENSION_IDS,
  DISTIL_STORE_EXTENSION_ID,
  EXTENSION_CONNECT_MESSAGE,
  EXTENSION_STATE_PATTERN,
} from "@/lib/extension/constants";
import { extensionMessagingAvailable, sendConnectMessage } from "@/lib/extension/handoff";

const payload = {
  state: "s".repeat(43),
  origin: "https://distil.example",
  token: "dst_cap_token",
  connection: {
    id: "conn-1",
    label: "Chrome on macOS",
    createdAt: "2026-09-30T00:00:00.000Z",
    accountId: "11111111-1111-4111-8111-111111111111",
  },
};

const scope = globalThis as { chrome?: unknown };

afterEach(() => {
  delete scope.chrome;
  jest.useRealTimers();
});

describe("extension id and state contract", () => {
  it("pins a well-formed 32-letter Chrome extension id", () => {
    expect(DISTIL_EXTENSION_ID).toMatch(/^[a-p]{32}$/);
  });

  it("lists the development id first and the Chrome Web Store id after it", () => {
    expect(DISTIL_STORE_EXTENSION_ID).toBe("malhlcmmheemmdebmjpgliligpjlnama");
    expect(DISTIL_EXTENSION_IDS).toEqual([DISTIL_EXTENSION_ID, DISTIL_STORE_EXTENSION_ID]);
    for (const id of DISTIL_EXTENSION_IDS) expect(id).toMatch(/^[a-p]{32}$/);
  });

  it("accepts hex and base64url nonces and rejects short or unsafe values", () => {
    expect(EXTENSION_STATE_PATTERN.test("a".repeat(64))).toBe(true);
    expect(EXTENSION_STATE_PATTERN.test("A-_".repeat(15))).toBe(true);
    expect(EXTENSION_STATE_PATTERN.test("short")).toBe(false);
    expect(EXTENSION_STATE_PATTERN.test(`${"a".repeat(40)}&next=//evil`)).toBe(false);
  });
});

describe("page-to-extension handoff", () => {
  it("reports unavailable messaging when no extension exposes chrome.runtime", async () => {
    expect(extensionMessagingAvailable()).toBe(false);
    await expect(sendConnectMessage(payload)).resolves.toBe("unreachable");
    scope.chrome = { runtime: {} };
    expect(extensionMessagingAvailable()).toBe(false);
  });

  it("sends the connect message to the pinned id and maps the extension's answer", async () => {
    const sendMessage = jest.fn((_id: string, _message: unknown, callback: (r?: unknown) => void) =>
      callback({ ok: true })
    );
    scope.chrome = { runtime: { sendMessage } };
    expect(extensionMessagingAvailable()).toBe(true);
    await expect(sendConnectMessage(payload)).resolves.toBe("accepted");
    expect(sendMessage).toHaveBeenCalledWith(
      DISTIL_EXTENSION_ID,
      { type: EXTENSION_CONNECT_MESSAGE, ...payload },
      expect.any(Function)
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);

    sendMessage.mockImplementation((_id, _message, callback) => callback({ ok: false }));
    await expect(sendConnectMessage(payload)).resolves.toBe("rejected");
    sendMessage.mockImplementation((_id, _message, callback) => callback(undefined));
    await expect(sendConnectMessage(payload)).resolves.toBe("rejected");
  });

  it("falls through to the store build when the development id is not installed", async () => {
    const runtime: { lastError?: { message: string }; sendMessage: jest.Mock } = {
      sendMessage: jest.fn((id: string, _message: unknown, callback: (r?: unknown) => void) => {
        if (id === DISTIL_STORE_EXTENSION_ID) {
          delete runtime.lastError;
          callback({ ok: true });
        } else {
          runtime.lastError = { message: "Could not establish connection." };
          callback();
        }
      }),
    };
    scope.chrome = { runtime };
    await expect(sendConnectMessage(payload)).resolves.toBe("accepted");
    expect(runtime.sendMessage.mock.calls.map(([id]) => id)).toEqual([
      DISTIL_EXTENSION_ID,
      DISTIL_STORE_EXTENSION_ID,
    ]);
  });

  it("treats lastError, a throw and silence as unreachable", async () => {
    const runtime: Record<string, unknown> = {
      lastError: { message: "Could not establish connection." },
      sendMessage: (_id: string, _message: unknown, callback: (r?: unknown) => void) => callback(),
    };
    scope.chrome = { runtime };
    await expect(sendConnectMessage(payload)).resolves.toBe("unreachable");

    scope.chrome = {
      runtime: {
        sendMessage: () => {
          throw new Error("no extension");
        },
      },
    };
    await expect(sendConnectMessage(payload)).resolves.toBe("unreachable");

    jest.useFakeTimers();
    scope.chrome = { runtime: { sendMessage: () => undefined } };
    const pending = sendConnectMessage(payload, 50);
    // One timeout per id: each id is only tried after the previous one stays silent.
    await jest.advanceTimersByTimeAsync(50 * DISTIL_EXTENSION_IDS.length + 10);
    await expect(pending).resolves.toBe("unreachable");
  });
});

describe("describeBrowser", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
      "Chrome on macOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
      "Chrome on Linux",
    ],
    ["curl/8.0", "Browser"],
  ])("labels %s", (userAgent, label) => {
    expect(describeBrowser(userAgent)).toBe(label);
  });
});
