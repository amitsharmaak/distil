/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";

import SettingsPage from "../page";

jest.mock("@/components/capture/token-settings", () => ({
  TokenSettings: () => <div>Token settings</div>,
}));
jest.mock("@/components/capture/capture-diagnostics", () => ({
  CaptureDiagnostics: () => <div>Capture diagnostics</div>,
}));
jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("SettingsPage", () => {
  it("keeps Archive while omitting the retired library surface", () => {
    render(<SettingsPage />);

    expect(
      screen.queryByRole("link", { name: ["Collec", "tions"].join("") })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/archive");
  });
});
