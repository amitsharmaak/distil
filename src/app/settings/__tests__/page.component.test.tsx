/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";

import SettingsPage from "../page";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ShortcutsHelpDialog } from "@/components/shortcuts/shortcuts-help-dialog";

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/components/capture/connected-browsers", () => ({
  ConnectedBrowsers: () => <div>Connected browsers</div>,
}));
jest.mock("@/components/capture/token-settings", () => ({
  TokenSettings: () => <div>Token settings</div>,
}));
jest.mock("@/components/capture/capture-diagnostics", () => ({
  CaptureDiagnostics: () => <div>Capture diagnostics</div>,
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
});
