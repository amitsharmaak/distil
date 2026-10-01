/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/lib/browser-navigation", () => ({ navigateFullPage: jest.fn() }));
jest.mock("@/lib/extension/handoff", () => ({
  extensionMessagingAvailable: jest.fn(),
  sendConnectMessage: jest.fn(),
}));

import { navigateFullPage } from "@/lib/browser-navigation";
import { DISTIL_EXTENSION_INSTALL_URL } from "@/lib/extension/constants";
import { extensionMessagingAvailable, sendConnectMessage } from "@/lib/extension/handoff";
import { ExtensionConnect } from "@/components/extension/extension-connect";
import ExtensionConnectPage from "../page";

const state = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";
const fetchMock = jest.mocked(global.fetch);
const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const issued = {
  token: "dst_cap_secret-token-value",
  connection: {
    id: "conn-1",
    label: "Chrome on macOS",
    createdAt: "2026-09-30T00:00:00.000Z",
    accountId: "11111111-1111-4111-8111-111111111111",
  },
};

function mockApi(account: Response) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/api/v1/account") return account;
    if (url === "/api/v1/extension/connections" && init?.method === "POST")
      return response(201, issued);
    if (url.startsWith("/api/v1/extension/connections/") && init?.method === "DELETE")
      return response(204);
    throw new Error(`unexpected fetch ${url}`);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  jest.mocked(navigateFullPage).mockReset();
  jest.mocked(extensionMessagingAvailable).mockReturnValue(true);
  jest.mocked(sendConnectMessage).mockReset();
  window.history.replaceState({}, "", "/extension/connect");
});

it("explains how to start when the extension's state is missing or malformed", async () => {
  const { unmount } = render(<ExtensionConnect />);
  expect(screen.getByText("Start from the extension")).toBeInTheDocument();
  unmount();
  render(<ExtensionConnect state="short" />);
  expect(screen.getByText("Start from the extension")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reads the state from the page's search params and renders the connect view", async () => {
  mockApi(response(200, { account: { email: "amit@example.com" } }));
  render(await ExtensionConnectPage({ searchParams: Promise.resolve({ state }) }));
  expect(await screen.findByRole("button", { name: "Connect" })).toBeInTheDocument();
});

it("shows the sign-in card when signed out and returns to this page afterwards", async () => {
  mockApi(response(401, { error: { code: "UNAUTHORIZED" } }));
  render(<ExtensionConnect state={state} />);

  expect(await screen.findByRole("heading", { name: "Sign in to Distil" })).toBeInTheDocument();
  fetchMock.mockResolvedValueOnce(response(200, { authenticated: true }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "amit@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);

  await waitFor(() =>
    expect(navigateFullPage).toHaveBeenCalledWith(
      `/extension/connect?state=${state}`,
      window.location
    )
  );
  expect(sendConnectMessage).not.toHaveBeenCalled();
});

it("offers the install link, and mints nothing, when the extension is not reachable", async () => {
  jest.mocked(extensionMessagingAvailable).mockReturnValue(false);
  mockApi(response(200, { account: { email: "amit@example.com" } }));
  render(<ExtensionConnect state={state} />);

  expect(await screen.findByText("Install the Distil extension first")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Get the Distil extension" })).toHaveAttribute(
    "href",
    DISTIL_EXTENSION_INSTALL_URL
  );
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
});

it("denies a session without an active account", async () => {
  mockApi(response(403));
  render(<ExtensionConnect state={state} />);
  expect(await screen.findByText("This account cannot connect a browser")).toBeInTheDocument();
});

it("connects on an explicit click, hands the token to the extension and never shows it", async () => {
  mockApi(response(200, { account: { email: "amit@example.com" } }));
  jest.mocked(sendConnectMessage).mockResolvedValue("accepted");
  render(<ExtensionConnect state={state} />);

  expect(await screen.findByText(/Signed in as amit@example.com/)).toBeInTheDocument();
  // Nothing is minted until the user clicks.
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));

  expect(await screen.findByText("Connected")).toBeInTheDocument();
  expect(sendConnectMessage).toHaveBeenCalledWith({
    state,
    origin: window.location.origin,
    token: issued.token,
    connection: issued.connection,
    accountEmail: "amit@example.com",
  });
  expect(document.body.textContent).not.toContain(issued.token);
});

it("turns the minted connection off again when the extension rejects the state", async () => {
  mockApi(response(200, { account: {} }));
  jest.mocked(sendConnectMessage).mockResolvedValue("rejected");
  render(<ExtensionConnect state={state} />);

  fireEvent.click(await screen.findByRole("button", { name: "Connect" }));

  expect(
    await screen.findByText("The extension did not accept the connection")
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/v1/extension/connections/conn-1",
    expect.objectContaining({ method: "DELETE" })
  );
  expect(document.body.textContent).not.toContain(issued.token);
});

it("shows an error when minting fails", async () => {
  fetchMock.mockImplementation(async (input, init) =>
    String(input) === "/api/v1/account"
      ? response(200, { account: {} })
      : init?.method === "POST"
        ? response(429, { error: { code: "RATE_LIMITED" } })
        : response(204)
  );
  render(<ExtensionConnect state={state} />);
  fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
  expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  expect(sendConnectMessage).not.toHaveBeenCalled();
});
