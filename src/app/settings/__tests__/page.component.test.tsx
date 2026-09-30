/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SettingsPage from "../page";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ShortcutsHelpDialog } from "@/components/shortcuts/shortcuts-help-dialog";

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
  it("keeps Archive while omitting the retired library surface", () => {
    render(<SettingsPage />, { wrapper: ShortcutsProvider });

    expect(
      screen.queryByRole("link", { name: ["Collec", "tions"].join("") })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/archive");
  });

  it("1 and 2 switch the Capture and Account tabs", () => {
    render(<SettingsPage />, { wrapper: ShortcutsProvider });
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "capture");
    fireEvent.keyDown(document.body, { key: "2" });
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "account");
    fireEvent.keyDown(document.body, { key: "1" });
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "capture");
  });

  it("fresh load: the first 2 press is handled (preventDefault) with no help-dialog cycle", () => {
    render(<SettingsPage />, { wrapper: ShortcutsProvider });
    // fireEvent returns false when a listener called preventDefault.
    expect(fireEvent.keyDown(document.body, { key: "2", code: "Digit2" })).toBe(false);
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "account");
    expect(fireEvent.keyDown(document.body, { key: "1", code: "Digit1" })).toBe(false);
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "capture");
  });

  it("? lists the Settings group", () => {
    render(
      <ShortcutsProvider>
        <SettingsPage />
        <ShortcutsHelpDialog />
      </ShortcutsProvider>
    );
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    expect(screen.getByText("Settings", { selector: "h3, h2, h4, div, span" })).toBeInTheDocument();
    expect(screen.getByText("Capture tab")).toBeInTheDocument();
    expect(screen.getByText("Account tab")).toBeInTheDocument();
  });

  it("shows the Invitations tab only to an admin", async () => {
    mockAccount(false);
    const { unmount } = render(<SettingsPage />, { wrapper: ShortcutsProvider });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/account", expect.anything())
    );
    expect(screen.queryByRole("button", { name: /Invitations/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Invitations settings")).not.toBeInTheDocument();
    unmount();

    mockAccount(true);
    render(<SettingsPage />, { wrapper: ShortcutsProvider });
    expect(await screen.findByText("Invitations settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invitations/ })).toBeInTheDocument();
  });

  it("stays a member view when the account request fails", async () => {
    render(<SettingsPage />, { wrapper: ShortcutsProvider });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("Invitations settings")).not.toBeInTheDocument();
  });
});
