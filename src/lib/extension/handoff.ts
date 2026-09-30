import { DISTIL_EXTENSION_IDS, EXTENSION_CONNECT_MESSAGE } from "@/lib/extension/constants";

/** Client-safe page-to-extension handoff over Chrome's `externally_connectable` messaging. */

interface ChromeRuntimeLike {
  lastError?: { message?: string };
  sendMessage(
    extensionId: string,
    message: unknown,
    callback: (response?: { ok?: boolean }) => void
  ): void;
}

function runtime(): ChromeRuntimeLike | undefined {
  const candidate = (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime;
  return typeof candidate?.sendMessage === "function" ? candidate : undefined;
}

/**
 * `chrome.runtime` exists on a web page only when an extension that lists this origin under
 * `externally_connectable` is installed. Without it the page must offer the install link.
 */
export function extensionMessagingAvailable(): boolean {
  return runtime() !== undefined;
}

export interface ConnectPayload {
  state: string;
  origin: string;
  token: string;
  connection: { id: string; label: string; createdAt: string; accountId: string };
  accountEmail?: string;
}

export type HandoffResult = "accepted" | "rejected" | "unreachable";

function sendToExtension(
  chromeRuntime: ChromeRuntimeLike,
  extensionId: string,
  payload: ConnectPayload,
  timeoutMs: number
): Promise<HandoffResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: HandoffResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish("unreachable"), timeoutMs);
    try {
      chromeRuntime.sendMessage(
        extensionId,
        { type: EXTENSION_CONNECT_MESSAGE, ...payload },
        (response) => {
          if (chromeRuntime.lastError) return finish("unreachable");
          finish(response?.ok === true ? "accepted" : "rejected");
        }
      );
    } catch {
      finish("unreachable");
    }
  });
}

/**
 * Sends the freshly minted token to the pinned extension id(s) and waits for the answer. Ids are
 * tried in order; only an unreachable id moves on to the next, an answer (accepted or rejected)
 * ends the attempt.
 */
export async function sendConnectMessage(
  payload: ConnectPayload,
  timeoutMs = 10_000
): Promise<HandoffResult> {
  const chromeRuntime = runtime();
  if (!chromeRuntime) return "unreachable";
  for (const id of DISTIL_EXTENSION_IDS) {
    const result = await sendToExtension(chromeRuntime, id, payload, timeoutMs);
    if (result !== "unreachable") return result;
  }
  return "unreachable";
}
