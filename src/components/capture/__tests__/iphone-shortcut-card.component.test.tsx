/** @jest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IphoneShortcutCard } from "@/components/capture/iphone-shortcut-card";
import * as publicConfig from "@/lib/public-config";

jest.mock("@/lib/public-config", () => ({ __esModule: true, apiBaseUrl: "", iosShortcutUrl: "" }));

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const now = new Date("2026-10-01T12:00:00Z");
const phone = {
  id: "phone-1",
  kind: "phone",
  label: "My iPhone",
  createdAt: "2026-09-30T12:00:00Z",
  lastUsedAt: now.toISOString(),
  tokenPrefix: "never-render-this-prefix",
};
const pairing = { code: "ABCD-EFGH", expiresAt: "2026-10-01T12:10:00Z" };
const mutableConfig = publicConfig as { iosShortcutUrl: string; apiBaseUrl: string };

let tokens: unknown[];
let pairingResponse: Response;
let deleteResponse: Response;

async function pair() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Pair this iPhone" })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Pair this iPhone" }));
  await screen.findByText(pairing.code);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
  fetchMock.mockReset();
  mutableConfig.iosShortcutUrl = "";
  mutableConfig.apiBaseUrl = "";
  tokens = [];
  pairingResponse = response(pairing, 201);
  deleteResponse = response({}, 204);
  fetchMock.mockImplementation(async (input, init) => {
    if (init?.method === "POST") return pairingResponse;
    if (init?.method === "DELETE") return deleteResponse;
    return response({ tokens });
  });
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

describe("IphoneShortcutCard", () => {
  it("hides the install link when unset and offers pairing with no existing phones", async () => {
    render(<IphoneShortcutCard />);
    expect(await screen.findByText("No iPhones paired yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Get the Shortcut" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pair this iPhone" })).toBeEnabled();
  });

  it("shows the configured install link and supports pairing from the keyboard", async () => {
    mutableConfig.iosShortcutUrl = "https://www.icloud.com/shortcuts/example";
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<IphoneShortcutCard />);
    await screen.findByText("No iPhones paired yet.");
    const link = screen.getByRole("link", { name: "Get the Shortcut" });
    expect(link).toHaveAttribute("href", mutableConfig.iosShortcutUrl);
    await user.tab();
    expect(link).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Pair this iPhone" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText(pairing.code)).toBeInTheDocument();
  });

  it("creates and replaces a code with an updating countdown, then hides it on expiry", async () => {
    render(<IphoneShortcutCard />);
    await pair();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/shortcut-pairings",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) })
    );
    expect(screen.getByRole("timer")).toHaveTextContent("Expires in 10:00");
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("Expires in 9:59");

    pairingResponse = response({ code: "JKLM-NPQR", expiresAt: "2026-10-01T12:00:03Z" }, 201);
    fireEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    expect(await screen.findByText("JKLM-NPQR")).toBeInTheDocument();
    expect(screen.queryByText(pairing.code)).not.toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("This code has expired.");
    expect(screen.queryByText("JKLM-NPQR")).not.toBeInTheDocument();
    const callsAtExpiry = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(callsAtExpiry);
    expect(screen.getByRole("button", { name: "Get a new code" })).toBeEnabled();
  });

  it("lists only active phones with paired and last-used dates, never credential prefixes", async () => {
    tokens = [
      phone,
      { ...phone, id: "unused", label: "Spare iPhone", lastUsedAt: undefined },
      { ...phone, id: "old", label: "Older iPhone", lastUsedAt: "2026-09-29T12:00:00Z" },
      { ...phone, id: "revoked", label: "Revoked", revokedAt: now.toISOString() },
      { ...phone, id: "manual", kind: "manual", label: "Manual" },
      { ...phone, id: "browser", kind: "browser", label: "Browser" },
    ];
    render(<IphoneShortcutCard />);
    const list = await screen.findByRole("list", { name: "Paired iPhones" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/Last used today/)).toHaveTextContent(
      `Paired ${new Date(phone.createdAt).toLocaleDateString()}`
    );
    expect(screen.getByText(/Not used yet/)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Last used ${new Date("2026-09-29T12:00:00Z").toLocaleDateString()}`)
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/never-render/)).not.toBeInTheDocument();
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
    expect(screen.queryByText("Browser")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoked")).not.toBeInTheDocument();
  });

  it("polls while pairing, shows the new phone without a reload and stops polling", async () => {
    tokens = [phone];
    render(<IphoneShortcutCard />);
    await pair();
    tokens = [phone, { ...phone, id: "new-phone", label: "New iPhone" }];
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(await screen.findByText("New iPhone")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("iPhone connected.");
    expect(screen.queryByText(pairing.code)).not.toBeInTheDocument();
    const callsAfterPair = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterPair);
  });

  it("refreshes when returning from Shortcuts and cleans up timers, listeners and requests", async () => {
    const { unmount } = render(<IphoneShortcutCard />);
    await pair();
    tokens = [phone];
    fireEvent(window, new Event("focus"));
    expect(await screen.findByText("My iPhone")).toBeInTheDocument();
    tokens = [{ ...phone, label: "Renamed iPhone" }];
    fireEvent(document, new Event("visibilitychange"));
    expect(await screen.findByText("Renamed iPhone")).toBeInTheDocument();
    unmount();
    const requests = fetchMock.mock.calls;
    expect(requests.every(([, init]) => init?.signal?.aborted)).toBe(true);
    const callCount = requests.length;
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(callCount);
  });

  it("aborts an active poll and stops polling when the card unmounts", async () => {
    const { unmount } = render(<IphoneShortcutCard />);
    await pair();
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    const pollingSignal = fetchMock.mock.calls.at(-1)?.[1]?.signal;
    expect(pollingSignal?.aborted).toBe(false);
    unmount();
    expect(pollingSignal?.aborted).toBe(true);
    const callCount = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(callCount);
  });

  it("disconnects one phone and removes only its row", async () => {
    tokens = [phone, { ...phone, id: "phone-2", label: "Second iPhone" }];
    render(<IphoneShortcutCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect My iPhone" }));
    await waitFor(() => expect(screen.queryByText("My iPhone")).not.toBeInTheDocument());
    expect(screen.getByText("Second iPhone")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/capture-tokens/phone-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("retains the phone and presents a retryable error when disconnect fails", async () => {
    tokens = [phone];
    deleteResponse = response({ error: { message: "untrusted internal detail" } }, 500);
    render(<IphoneShortcutCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect My iPhone" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not disconnect this iPhone.");
    expect(screen.getByText("My iPhone")).toBeInTheDocument();
    expect(screen.queryByText(/untrusted/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect My iPhone" })).toBeEnabled();
  });

  it("discards a previous code when replacement fails and never displays the server error body", async () => {
    render(<IphoneShortcutCard />);
    await pair();
    pairingResponse = response({ error: { message: "untrusted internal detail" } }, 500);
    fireEvent.click(screen.getByRole("button", { name: "Get a new code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create a pairing code.");
    expect(screen.queryByText(pairing.code)).not.toBeInTheDocument();
    expect(screen.queryByText(/untrusted/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pair this iPhone" })).toBeEnabled();
  });

  it("retries a failed device load before allowing pairing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("untrusted detail"));
    render(<IphoneShortcutCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load your paired iPhones."
    );
    expect(screen.getByRole("button", { name: "Pair this iPhone" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading iPhones" }));
    expect(await screen.findByText("No iPhones paired yet.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pair this iPhone" })).toBeEnabled();
  });
});
