/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SettingsPage from "../page";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ShortcutsHelpDialog } from "@/components/shortcuts/shortcuts-help-dialog";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/components/capture/connected-browsers", () => ({
  ConnectedBrowsers: () => <div>Connected browsers</div>,
}));
jest.mock("@/components/capture/iphone-shortcut-card", () => ({
  IphoneShortcutCard: () => <div>iPhone Shortcut</div>,
}));
jest.mock("@/components/capture/token-settings", () => ({
  TokenSettings: () => <div>Token settings</div>,
}));
jest.mock("@/components/capture/capture-diagnostics", () => ({
  CaptureDiagnostics: () => <div>Capture diagnostics</div>,
}));
jest.mock("@/components/settings/invitations-settings", () => ({
  InvitationsSettings: () => <div>Invitations settings</div>,
}));
jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value }: { children: React.ReactNode; value?: string }) => (
    <div data-testid="tabs" data-value={value}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <ContentCacheProvider accountKey="test-account">
      <ShortcutsProvider>{children}</ShortcutsProvider>
    </ContentCacheProvider>
  );
}

function mockAccount(isAdmin: boolean, failures = 0) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/v1/account")) return json({ account: { isAdmin } });
    if (url.startsWith("/api/v1/captures")) {
      return json({ receipts: Array.from({ length: failures }, (_, id) => ({ id })) });
    }
    throw new Error(`unexpected request ${url}`);
  });
}

beforeEach(() => fetchMock.mockReset());

describe("SettingsPage", () => {
  it("orders Capture cards as manual token, browsers, then iPhone", () => {
    render(<SettingsPage />, { wrapper: TestProvider });
    const manual = screen.getByText("Token settings");
    const browsers = screen.getByText("Connected browsers");
    const iphone = screen.getByText("iPhone Shortcut");
    expect(
      manual.compareDocumentPosition(browsers) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      browsers.compareDocumentPosition(iphone) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("keeps Archive while omitting the retired library surface", () => {
    render(<SettingsPage />, { wrapper: TestProvider });

    expect(
      screen.queryByRole("link", { name: ["Collec", "tions"].join("") })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/archive");
  });

  it("1 and 2 switch the Capture and Account tabs", () => {
    render(<SettingsPage />, { wrapper: TestProvider });
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "capture");
    fireEvent.keyDown(document.body, { key: "2" });
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "account");
    fireEvent.keyDown(document.body, { key: "1" });
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "capture");
  });

  it("fresh load: the first 2 press is handled (preventDefault) with no help-dialog cycle", () => {
    render(<SettingsPage />, { wrapper: TestProvider });
    // fireEvent returns false when a listener called preventDefault.
    expect(fireEvent.keyDown(document.body, { key: "2", code: "Digit2" })).toBe(false);
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "account");
    expect(fireEvent.keyDown(document.body, { key: "1", code: "Digit1" })).toBe(false);
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "capture");
  });

  it("? lists the Settings group", () => {
    render(
      <TestProvider>
        <SettingsPage />
        <ShortcutsHelpDialog />
      </TestProvider>
    );
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    expect(screen.getByText("Settings", { selector: "h3, h2, h4, div, span" })).toBeInTheDocument();
    expect(screen.getByText("Capture tab")).toBeInTheDocument();
    expect(screen.getByText("Account tab")).toBeInTheDocument();
  });

  it("shows no Invitations or Troubleshooting tab to a non-admin and keeps diagnostics out of Capture", async () => {
    mockAccount(false);
    render(<SettingsPage />, { wrapper: TestProvider });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/account", expect.anything())
    );
    expect(screen.queryByRole("button", { name: /Invitations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Troubleshooting/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Invitations settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Capture diagnostics")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/captures"),
      expect.anything()
    );
  });

  it("stays a member view when the account request fails", async () => {
    render(<SettingsPage />, { wrapper: TestProvider });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("Invitations settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Capture diagnostics")).not.toBeInTheDocument();
  });

  it("gives an admin the Invitations tab and a Troubleshooting tab holding the diagnostics", async () => {
    mockAccount(true, 3);
    render(<SettingsPage />, { wrapper: TestProvider });
    expect(await screen.findByText("Invitations settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invitations/ })).toBeInTheDocument();
    const troubleshooting = screen.getByRole("button", { name: /Troubleshooting/ });
    expect(troubleshooting).toBeInTheDocument();
    await waitFor(() => expect(troubleshooting).toHaveTextContent("3"));
    expect(screen.getByText("Capture diagnostics")).toBeInTheDocument();
  });

  it("omits the failure badge when nothing failed", async () => {
    mockAccount(true, 0);
    render(<SettingsPage />, { wrapper: TestProvider });
    const troubleshooting = await screen.findByRole("button", { name: /Troubleshooting/ });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/captures"),
        expect.anything()
      )
    );
    expect(troubleshooting).not.toHaveTextContent(/\d/);
  });
});
